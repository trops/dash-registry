/**
 * GET /api/orgs/by-slug/[slug]
 *
 * Resolve a URL-friendly slug to the full org record. Used by the
 * /orgs/[slug] page to turn the route param into the orgId needed for
 * membership endpoints.
 *
 * Auth required. Returns the org record only if the caller is a member
 * — non-members see 404 so org slugs aren't enumerable.
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

    try {
        const org = await getOrgBySlug(params.slug.toLowerCase());
        if (!org) {
            return NextResponse.json(
                { error: "Org not found" },
                { status: 404 },
            );
        }
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
