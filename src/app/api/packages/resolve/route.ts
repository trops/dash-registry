/**
 * POST /api/packages/resolve
 *
 * Bulk-resolve package references to their registry state. Used by the
 * batch-publish dialog (in dash-core) to decorate each widget / theme
 * dependency row with "is it in the registry?", "who owns it?",
 * "what version / visibility?".
 *
 * Request body:
 *   { refs: [{ scope, name }, ...] }   // max 100 refs
 *
 * Response:
 *   [{ scope, name, exists, latestVersion, visibility, ownedByMe, readable }]
 *
 * Auth is optional. Anonymous callers get ownedByMe/readable = false and
 * private packages they can't read surface as { exists: false } to avoid
 * leaking existence.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPackage, getUserByCognitoId } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { checkEntitlement } from "@/lib/entitlement";

export const dynamic = "force-dynamic";

const MAX_REFS = 100;

type Ref = { scope: string; name: string };

type ResolvedRef = {
    scope: string;
    name: string;
    exists: boolean;
    latestVersion: string | null;
    visibility: "public" | "private" | null;
    ownedByMe: boolean;
    readable: boolean;
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
                    { error: "Each ref must be { scope: string, name: string }" },
                    { status: 400 },
                );
            }
            typedRefs.push({
                scope: (r as Ref).scope,
                name: (r as Ref).name,
            });
        }

        // Optional auth — identity widens what we can surface
        const token = await authenticateRequest(request);
        const userId = token?.sub || null;
        let verifiedEmail: string | null = null;
        if (userId) {
            const userRecord = await getUserByCognitoId(userId);
            verifiedEmail =
                (userRecord?.email as string | undefined) ||
                token?.email ||
                null;
        }

        const results: ResolvedRef[] = await Promise.all(
            typedRefs.map(async (ref) => {
                const pkg = await getPackage(ref.scope, ref.name);
                if (!pkg) {
                    return {
                        scope: ref.scope,
                        name: ref.name,
                        exists: false,
                        latestVersion: null,
                        visibility: null,
                        ownedByMe: false,
                        readable: false,
                    };
                }

                const visibility =
                    (pkg.visibility as "public" | "private") || "public";
                const ownerId = (pkg.ownerId || pkg.author) as
                    | string
                    | undefined;
                const ownedByMe = !!userId && !!ownerId && userId === ownerId;

                let readable = visibility === "public" || ownedByMe;
                if (!readable) {
                    const decision = await checkEntitlement({
                        userId: userId || "",
                        verifiedEmail,
                        pkg: {
                            scope: ref.scope,
                            name: ref.name,
                            visibility,
                            ownerId,
                        },
                        version: (pkg.latestVersion as string) || "*",
                    });
                    readable = decision.allowed;
                }

                // Private + not readable → surface as not-found to avoid leaking
                if (visibility === "private" && !readable && !ownedByMe) {
                    return {
                        scope: ref.scope,
                        name: ref.name,
                        exists: false,
                        latestVersion: null,
                        visibility: null,
                        ownedByMe: false,
                        readable: false,
                    };
                }

                return {
                    scope: ref.scope,
                    name: ref.name,
                    exists: true,
                    latestVersion: (pkg.latestVersion as string) || null,
                    visibility,
                    ownedByMe,
                    readable,
                };
            }),
        );

        return NextResponse.json(results);
    } catch (error) {
        console.error("[api/packages/resolve] error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
