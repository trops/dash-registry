/**
 * GET /api/packages/[scope]/[name]/download
 *
 * Generate a pre-signed S3 download URL for a package ZIP.
 * Signed in: tracks the download in the user's library. Signed out: public
 * packages only (anything else answers 401, so the app asks to sign in and a
 * private package's existence isn't revealed); logged under the hashed IP
 * with the app's anonymous install ID, and rate-limited per IP.
 *
 * ?purpose=preview marks a read that isn't an install (the app previewing an
 * update, or drawing a starter's thumbnail): logged as a preview and kept
 * out of the user's library, so install counts stay installs.
 *
 * For private packages: checks entitlements before issuing the URL, uses a
 * 60-second TTL on the signed URL, and writes an InstallLog entry recording
 * the access decision (granted or denied + reason).
 *
 * Query params: ?version= (defaults to latest)
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
    getPackage,
    getPackageVersion,
    getUserByCognitoId,
    putUserLibraryEntry,
} from "@/lib/db";
import { getDownloadUrl, getPrivatePackageSignedUrl } from "@/lib/s3";
import { checkEntitlement } from "@/lib/entitlement";
import {
    logInstallAttempt,
    extractClientIp,
    hashIp,
    anonymousLogKey,
    isAnonymousRateLimited,
    parseInstallId,
    INSTALL_ID_HEADER,
    ANON_RATE_WINDOW_SECONDS,
} from "@/lib/installLog";
import { isPrivatePackagesEnabled } from "@/lib/featureFlags";
import {
    signManifestBody,
    CURRENT_MANIFEST_SIGNATURE_KEYID,
} from "@/lib/crypto";
import { getRegistryRootKeys } from "@/lib/registryRootKey";

export const runtime = "nodejs";

export async function GET(
    request: NextRequest,
    { params }: { params: { scope: string; name: string } },
) {
    // 1. Authenticate. No token = a signed-out download (public only); a
    //    token that doesn't verify (expired) still answers 401 so the app
    //    can sign in again.
    const authRequired = () =>
        NextResponse.json(
            { error: "Authentication required to download packages" },
            { status: 401 },
        );
    const sentToken = !!request.headers
        .get("Authorization")
        ?.startsWith("Bearer ");
    const token = await authenticateRequest(request);
    if (!token && sentToken) return authRequired();
    const anonymous = !token;

    try {
        const { scope, name } = params;
        const { searchParams } = new URL(request.url);
        const ipHash = hashIp(extractClientIp(request.headers));
        const userAgent = request.headers.get("user-agent") || null;
        const installId = parseInstallId(
            request.headers.get(INSTALL_ID_HEADER),
        );
        const purpose =
            searchParams.get("purpose") === "preview" ? "preview" : "install";

        // 2. Get package
        const pkg = await getPackage(scope, name);
        if (anonymous && (!pkg || pkg.visibility === "private")) {
            return authRequired();
        }
        if (!pkg) {
            return NextResponse.json(
                { error: "Package not found" },
                { status: 404 },
            );
        }
        if (anonymous && (await isAnonymousRateLimited(ipHash))) {
            return NextResponse.json(
                { error: "Too many downloads — try again in a few minutes." },
                {
                    status: 429,
                    headers: { "Retry-After": String(ANON_RATE_WINDOW_SECONDS) },
                },
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
        const logUserId = token ? token.sub : anonymousLogKey(ipHash);
        const userRecord = token ? await getUserByCognitoId(token.sub) : null;
        const verifiedEmail = token
            ? (userRecord?.email as string | undefined) || token.email || null
            : null;
        // Signed out it's public (checked above).
        const entitlement = token
            ? await checkEntitlement({
                  userId: token.sub,
                  verifiedEmail,
                  pkg: {
                      scope,
                      name,
                      visibility: pkg.visibility as string | undefined,
                      ownerId: (pkg.ownerId || pkg.author) as
                          | string
                          | undefined,
                  },
                  version,
                  // A preview doesn't use up a seat on a seat-limited grant.
                  claimSeat: purpose === "install",
              })
            : { allowed: true, reason: "public" as const, entitlementId: null };

        if (!entitlement.allowed) {
            // Log denial then return 404 (not 403) — we don't reveal that
            // a private package exists to non-entitled users.
            await logInstallAttempt({
                userId: logUserId,
                packageScope: scope,
                packageName: name,
                version,
                installId,
                purpose,
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
            userId: logUserId,
            packageScope: scope,
            packageName: name,
            version,
            installId,
            purpose,
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

        // 7. Track in user's library (signed in, installs only)
        if (token && purpose === "install") {
            await putUserLibraryEntry({
                userId: token.sub,
                packageScope: scope,
                packageName: name,
                installedVersion: version,
                source: "registry",
            });
        }

        // 8. Look up signing metadata for this version (Phase 1A).
        //    Optional — older versions published before signing
        //    rolled out won't have these fields. Installers treat
        //    missing fields per their policy (Phase 1C will refuse
        //    to mount unsigned downloads once enforcement flips on).
        const versionRecord = await getPackageVersion(scope, name, version);
        const signing = versionRecord
            ? {
                  zipSignature:
                      (versionRecord.zipSignature as string | undefined) ?? null,
                  publisherCert:
                      (versionRecord.publisherCert as object | undefined) ?? null,
                  publisherKeyId:
                      (versionRecord.publisherKeyId as string | undefined) ?? null,
                  publisherFingerprint:
                      (versionRecord.publisherFingerprint as
                          | string
                          | undefined) ?? null,
              }
            : {
                  zipSignature: null,
                  publisherCert: null,
                  publisherKeyId: null,
                  publisherFingerprint: null,
              };

        // Phase 5D (P1 #24): sign the response body with the
        // registry root key so a MITM that swaps any field (downloadUrl,
        // publisherCert, zipSignature, …) gets caught client-side
        // before install. Signature is computed over the canonical
        // JSON of `body` minus the two signature fields themselves.
        const body: Record<string, unknown> = {
            downloadUrl,
            version,
            packageId: `${scope}/${name}`,
            ...signing,
        };
        let manifest_signature: string | null = null;
        try {
            const { privateKey } = await getRegistryRootKeys();
            manifest_signature = await signManifestBody({
                body,
                registryRootPrivateKey: privateKey,
            });
        } catch (signErr) {
            // Signing failure is logged; we still return the body so
            // existing clients (which don't yet enforce manifest
            // signing) keep working. Clients in strict mode will
            // refuse this response — the right outcome when the
            // registry can't reach its key material.
            console.error(
                "[API /download] Manifest signing failed:",
                signErr,
            );
        }

        return NextResponse.json({
            ...body,
            manifest_signature,
            manifest_signature_keyid: manifest_signature
                ? CURRENT_MANIFEST_SIGNATURE_KEYID
                : null,
        });
    } catch (err) {
        console.error("[API /download] Error:", err);
        return NextResponse.json(
            { error: "Failed to generate download URL" },
            { status: 500 },
        );
    }
}
