/**
 * POST /api/orgs/[orgId]/members — add a member by userId (admin only)
 * GET  /api/orgs/[orgId]/members — list members (member only)
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { addMember, getMembers, isAdmin, isMember } from "@/lib/orgs";

export async function POST(
  request: NextRequest,
  { params }: { params: { orgId: string } },
) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { orgId } = params;
  if (!(await isAdmin(orgId, token.sub))) {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { userId, role } = body || {};
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }
    if (role && !["member", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "role must be 'member' or 'admin'" },
        { status: 400 },
      );
    }
    const membership = await addMember(orgId, userId, role);
    return NextResponse.json({ membership }, { status: 201 });
  } catch (err) {
    console.error("[API /orgs/members POST] Error:", err);
    return NextResponse.json(
      { error: "Failed to add member" },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { orgId: string } },
) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { orgId } = params;
  if (!(await isMember(orgId, token.sub))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  try {
    const members = await getMembers(orgId);
    return NextResponse.json({ members });
  } catch (err) {
    console.error("[API /orgs/members GET] Error:", err);
    return NextResponse.json(
      { error: "Failed to list members" },
      { status: 500 },
    );
  }
}
