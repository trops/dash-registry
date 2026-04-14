/**
 * GET /api/orgs/by-slug/[slug]        — full org record (members only)
 * GET /api/orgs/by-slug/[slug]?minimal — minimal org record (any authed user)
 *
 * The full path is used by the /orgs/[slug] page and requires the caller
 * to be a member — this keeps member lists, roles, and full org details
 * private.
 *
 * The `?minimal` path is used by the package access-management flow to
 * resolve a slug typed by a package owner into an orgId for granting.
 * Any authenticated user can use it, but the response only includes
 * orgId, slug, and name — no member list, no ownership, no internal
 * fields. 404 on unknown slug is an intentional minor enumeration
 * vector; discovering that an org exists tells the caller nothing
 * about who's in it.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getOrgBySlug } from "@/lib/db";
import { isMember } from "@/lib/orgs";

export async function GET(
    request: NextRequest,
    { params }: { params: { slug: string } },
) {
    const token = await authenticateRequest(request);
    if (!token) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const { searchParams } = new URL(request.url);
    const minimal = searchParams.has("minimal");

    try {
        const org = await getOrgBySlug(params.slug.toLowerCase());
        if (!org) {
            return NextResponse.json(
                { error: "Org not found" },
                { status: 404 },
            );
        }

        if (minimal) {
            return NextResponse.json({
                org: {
                    orgId: org.orgId,
                    slug: org.slug,
                    name: org.name,
                },
            });
        }

        // Full record requires membership.
        if (!(await isMember(org.orgId, token.sub))) {
            return NextResponse.json(
                { error: "Org not found" },
                { status: 404 },
            );
        }
        return NextResponse.json({ org });
    } catch (err) {
        console.error("[API /orgs/by-slug] Error:", err);
        return NextResponse.json(
            { error: "Failed to look up org" },
            { status: 500 },
        );
    }
}
