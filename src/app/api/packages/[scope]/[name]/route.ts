/**
 * GET /api/packages/[scope]/[name]
 *
 * Get full package details + version history.
 * Public, no auth required.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPackage, getPackageVersions } from "@/lib/db";

export async function GET(
    _request: NextRequest,
    { params }: { params: { scope: string; name: string } },
) {
    try {
        const { scope, name } = params;

        const pkg = await getPackage(scope, name);
        if (!pkg) {
            return NextResponse.json(
                { error: "Package not found" },
                { status: 404 },
            );
        }

        // Only return public packages
        if (pkg.visibility === "private") {
            return NextResponse.json(
                { error: "Package not found" },
                { status: 404 },
            );
        }

        // Get version history
        const versions = await getPackageVersions(scope, name);

        // Sort versions by createdAt descending
        versions.sort(
            (a, b) =>
                new Date(b.createdAt as string).getTime() -
                new Date(a.createdAt as string).getTime(),
        );

        return NextResponse.json({
            ...pkg,
            versions: versions.map((v) => ({
                version: v.version,
                createdAt: v.createdAt,
                fileSize: v.fileSize,
                widgets: v.widgets,
            })),
        });
    } catch (err) {
        console.error("[API /packages/[scope]/[name]] Error:", err);
        return NextResponse.json(
            { error: "Failed to fetch package" },
            { status: 500 },
        );
    }
}
