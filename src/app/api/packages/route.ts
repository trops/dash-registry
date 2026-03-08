/**
 * GET /api/packages
 *
 * List all public packages. Replaces the static registry-index.json.
 * Supports query params: ?search=, ?category=, ?type=
 * Public, no auth required.
 */
import { NextRequest, NextResponse } from "next/server";
import { listPackages } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || undefined;
        const category = searchParams.get("category") || undefined;
        const type = searchParams.get("type") || undefined;

        const packages = await listPackages({ search, category, type });

        // Sort alphabetically by scope/name
        packages.sort((a, b) => {
            const aKey = `${a.scope}/${a.name}`;
            const bKey = `${b.scope}/${b.name}`;
            return aKey.localeCompare(bKey);
        });

        // Normalize: add `version` alias of `latestVersion` so dash-core
        // code that reads pkg.version works unchanged.
        const normalizedPackages = packages.map((pkg) => ({
            ...pkg,
            version: pkg.latestVersion,
        }));

        return NextResponse.json({
            version: "2.0.0",
            lastUpdated: new Date().toISOString(),
            packages: normalizedPackages,
        });
    } catch (err) {
        console.error("[API /packages] Error:", err);
        return NextResponse.json(
            { error: "Failed to fetch packages" },
            { status: 500 },
        );
    }
}
