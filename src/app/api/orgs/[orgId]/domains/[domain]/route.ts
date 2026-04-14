/**
 * DELETE /api/orgs/[orgId]/domains/[domain]
 *
 * Remove a domain claim — whether pending or verified. Admin only.
 * Verified domains stop granting access immediately after removal.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { isAdmin } from "@/lib/orgs";
import { deleteOrgDomain, getOrgDomain } from "@/lib/db";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { orgId: string; domain: string } },
) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { orgId } = params;
  const domain = decodeURIComponent(params.domain).trim().toLowerCase();

  if (!(await isAdmin(orgId, token.sub))) {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 },
    );
  }

  try {
    const existing = await getOrgDomain(orgId, domain);
    if (!existing) {
      return NextResponse.json(
        { error: "Domain claim not found" },
        { status: 404 },
      );
    }
    await deleteOrgDomain(orgId, domain);
    return NextResponse.json({ removed: true });
  } catch (err) {
    console.error("[API /orgs/domains DELETE] Error:", err);
    return NextResponse.json(
      { error: "Failed to remove domain" },
      { status: 500 },
    );
  }
}
