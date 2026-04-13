/**
 * GET /api/packages/[scope]/[name]/download
 *
 * Generate a pre-signed S3 download URL for a package ZIP.
 * Auth required — tracks download in user's library.
 *
 * For private packages: checks entitlements before issuing the URL, uses a
 * 60-second TTL on the signed URL, and writes an InstallLog entry recording
 * the access decision (granted or denied + reason).
 *
 * Query params: ?version= (defaults to latest)
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPackage, getUserByCognitoId, putUserLibraryEntry } from "@/lib/db";
import { getDownloadUrl, getPrivatePackageSignedUrl } from "@/lib/s3";
import { checkEntitlement } from "@/lib/entitlement";
import {
    logInstallAttempt,
    extractClientIp,
    hashIp,
} from "@/lib/installLog";
import { isPrivatePackagesEnabled } from "@/lib/featureFlags";

export async function GET(
    request: NextRequest,
    { params }: { params: { scope: string; name: string } },
) {
    // 1. Authenticate
    const token = await authenticateRequest(request);
    if (!token) {
        return NextResponse.json(
            { error: "Authentication required to download packages" },
            { status: 401 },
        );
    }

    try {
        const { scope, name } = params;
        const { searchParams } = new URL(request.url);

        // 2. Get package
        const pkg = await getPackage(scope, name);
        if (!pkg) {
            return NextResponse.json(
                { error: "Package not found" },
                { status: 404 },
            );
        }

        // 3. Determine version
        const version =
            searchParams.get("version") || (pkg.latestVersion as string);

        // 4. Entitlement check (no-op when feature flag is off — public
        //    packages always pass). We resolve the user's registered email
        //    from our own Users table; that row was created at register
        //    time using the verified email from Cognito, so we trust it
        //    to match email-pending entitlements.
        const ipHash = hashIp(extractClientIp(request.headers));
        const userAgent = request.headers.get("user-agent") || null;
        const userRecord = await getUserByCognitoId(token.sub);
        const verifiedEmail =
            (userRecord?.email as string | undefined) || token.email || null;
        const entitlement = await checkEntitlement({
            userId: token.sub,
            verifiedEmail,
            pkg: {
                scope,
                name,
                visibility: pkg.visibility as string | undefined,
                ownerId: (pkg.ownerId || pkg.author) as string | undefined,
            },
            version,
        });

        if (!entitlement.allowed) {
            // Log denial then return 404 (not 403) — we don't reveal that
            // a private package exists to non-entitled users.
            await logInstallAttempt({
                userId: token.sub,
                packageScope: scope,
                packageName: name,
                version,
                result:
                    entitlement.reason === "seats_exhausted"
                        ? "denied_seats_exhausted"
                        : entitlement.reason === "expired"
                          ? "denied_expired"
                          : "denied_no_entitlement",
                entitlementId: null,
                ipHash,
                userAgent,
            });
            return NextResponse.json(
                { error: "Package not found" },
                { status: 404 },
            );
        }

        // 5. Generate pre-signed URL — short TTL for private packages
        const isPrivate =
            isPrivatePackagesEnabled() && pkg.visibility === "private";
        const downloadUrl = isPrivate
            ? await getPrivatePackageSignedUrl(scope, name, version)
            : await getDownloadUrl(scope, name, version);

        // 6. Log granted access
        await logInstallAttempt({
            userId: token.sub,
            packageScope: scope,
            packageName: name,
            version,
            result:
                entitlement.reason === "owner"
                    ? "granted_owner"
                    : entitlement.reason === "entitled"
                      ? "granted_entitlement"
                      : "granted_public",
            entitlementId: entitlement.entitlementId,
            ipHash,
            userAgent,
        });

        // 7. Track in user's library
        await putUserLibraryEntry({
            userId: token.sub,
            packageScope: scope,
            packageName: name,
            installedVersion: version,
            source: "registry",
        });

        return NextResponse.json({
            downloadUrl,
            version,
            packageId: `${scope}/${name}`,
        });
    } catch (err) {
        console.error("[API /download] Error:", err);
        return NextResponse.json(
            { error: "Failed to generate download URL" },
            { status: 500 },
        );
    }
}
