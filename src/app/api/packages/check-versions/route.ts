/**
 * POST /api/packages/check-versions
 *
 * Bulk version-check endpoint used by the Dash app to find which of the
 * user's installed packages have newer versions on the registry. Returns
 * the latest version per ref REGARDLESS of visibility/auth — visibility
 * filtering only applies to discovery flows (search/browse), not to
 * "the caller already has these packages installed and is asking what
 * version they should be on."
 *
 * Security model:
 *   - Returns latestVersion ONLY (no downloadUrl, no description, no
 *     widget metadata). The version of a known ID is a trivial leak —
 *     the caller proved knowledge of the ID by submitting it.
 *   - The package download endpoint (/api/packages/[scope]/[name]/download)
 *     still enforces full visibility + entitlement gating. This endpoint
 *     does not grant any new download capability.
 *   - The /api/packages/resolve endpoint (which returns visibility +
 *     ownership) remains the right call when the caller needs that
 *     metadata — it correctly surfaces private-unowned packages as
 *     {exists: false} to avoid existence-leaking in discovery contexts.
 *
 * Why this endpoint exists when /resolve covers signed-in users:
 *   At app launch in dash-electron, the user is typically NOT yet signed
 *   in (token restore is async, may not have completed). The widget-
 *   update check runs at mount and was previously fetching the index
 *   anonymously — which hid every private package the user has
 *   installed. Result: private packages were invisible to the updater
 *   forever unless the user happened to manually re-check AFTER
 *   signing in. This endpoint lets the unauthenticated launch-time
 *   check still discover updates for installed packages.
 *
 * Request body:
 *   { refs: [{ scope: string, name: string }, ...] }   // max 200 refs
 *
 * Response:
 *   [{ scope, name, exists, latestVersion }]
 */
import { NextRequest, NextResponse } from "next/server";
import { getPackage } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_REFS = 200;

type Ref = { scope: string; name: string };

type CheckedRef = {
    scope: string;
    name: string;
    exists: boolean;
    latestVersion: string | null;
};

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => null);
        const refs: unknown = body?.refs;

        if (!Array.isArray(refs)) {
            return NextResponse.json(
                { error: "Request body must be { refs: [{scope, name}, ...] }" },
                { status: 400 },
            );
        }
        if (refs.length === 0) {
            return NextResponse.json([]);
        }
        if (refs.length > MAX_REFS) {
            return NextResponse.json(
                { error: `Too many refs — max ${MAX_REFS} per request` },
                { status: 400 },
            );
        }

        // Validate ref shapes
        const typedRefs: Ref[] = [];
        for (const r of refs) {
            if (
                !r ||
                typeof r !== "object" ||
                typeof (r as Ref).scope !== "string" ||
                typeof (r as Ref).name !== "string" ||
                !(r as Ref).scope ||
                !(r as Ref).name
            ) {
                return NextResponse.json(
                    {
                        error: "Each ref must be { scope: string, name: string }",
                    },
                    { status: 400 },
                );
            }
            typedRefs.push({
                scope: (r as Ref).scope,
                name: (r as Ref).name,
            });
        }

        const results: CheckedRef[] = await Promise.all(
            typedRefs.map(async (ref) => {
                const pkg = await getPackage(ref.scope, ref.name);
                if (!pkg) {
                    return {
                        scope: ref.scope,
                        name: ref.name,
                        exists: false,
                        latestVersion: null,
                    };
                }
                return {
                    scope: ref.scope,
                    name: ref.name,
                    exists: true,
                    latestVersion: (pkg.latestVersion as string) || null,
                };
            }),
        );

        return NextResponse.json(results);
    } catch (error) {
        console.error("[api/packages/check-versions] error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
