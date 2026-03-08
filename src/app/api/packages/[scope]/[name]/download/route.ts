/**
 * GET /api/packages/[scope]/[name]/download
 *
 * Generate a pre-signed S3 download URL for a package ZIP.
 * Auth required — tracks download in user's library.
 * Query params: ?version= (defaults to latest)
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPackage, putUserLibraryEntry } from "@/lib/db";
import { getDownloadUrl } from "@/lib/s3";

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
            searchParams.get("version") ||
            (pkg.latestVersion as string);

        // 4. Generate pre-signed URL
        const downloadUrl = await getDownloadUrl(scope, name, version);

        // 5. Track in user's library
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
