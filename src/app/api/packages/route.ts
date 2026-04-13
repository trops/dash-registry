/**
 * GET /api/packages
 *
 * List packages visible to the caller. Replaces the static registry-index.json.
 * Supports query params: ?search=, ?category=, ?type=
 *
 * Auth is optional here — anonymous callers only see public packages, but an
 * authenticated caller also sees private packages they have an entitlement for
 * (via direct grant, org membership, or ownership).
 */
import { NextRequest, NextResponse } from "next/server";
import { listPackages } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { filterReadableByUser } from "@/lib/entitlement";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || undefined;
        const category = searchParams.get("category") || undefined;
        const type = searchParams.get("type") || undefined;
        const appOrigin = searchParams.get("appOrigin") || undefined;
        const capabilities = searchParams.get("capabilities") || undefined;
        const providerTypesParam = searchParams.get("providerTypes") || undefined;
        const providerTypes = providerTypesParam
            ? providerTypesParam.split(",").map((t) => t.trim()).filter(Boolean)
            : undefined;

        // Optional auth — identity used only to widen what the user can see.
        const token = await authenticateRequest(request);
        const userId = token?.sub || null;

        const rawPackages = await listPackages({ search, category, type, appOrigin, providerTypes });
        const packages = (await filterReadableByUser(
            rawPackages as Parameters<typeof filterReadableByUser>[0],
            userId,
        )) as typeof rawPackages;

        // Sort alphabetically by scope/name
        packages.sort((a, b) => {
            const aKey = `${a.scope}/${a.name}`;
            const bKey = `${b.scope}/${b.name}`;
            return aKey.localeCompare(bKey);
        });

        // Normalize: add `version` alias of `latestVersion` so dash-core
        // code that reads pkg.version works unchanged.
        let normalizedPackages = packages.map((pkg) => ({
            ...pkg,
            version: pkg.latestVersion,
        }));

        // Filter by app capabilities — exclude packages whose required
        // "api" providers are not all present in the capabilities list
        if (capabilities) {
            type Provider = { providerClass?: string; type?: string; required?: boolean };
            type Widget = { providers?: Provider[] };
            const capSet = new Set(
                capabilities.split(",").map((c: string) => c.trim().toLowerCase()),
            );
            normalizedPackages = normalizedPackages.filter((pkg) => {
                const rec = pkg as Record<string, unknown>;
                const apiProviders: string[] = [];
                // Package-level providers
                for (const p of (rec.providers as Provider[]) || []) {
                    if (p.providerClass === "api" && p.required !== false) {
                        apiProviders.push(p.type || "");
                    }
                }
                // Widget-level providers
                for (const w of (rec.widgets as Widget[]) || []) {
                    for (const p of w.providers || []) {
                        if (p.providerClass === "api" && p.required !== false) {
                            apiProviders.push(p.type || "");
                        }
                    }
                }
                return apiProviders.every((api) => capSet.has(api.toLowerCase()));
            });
        }

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
