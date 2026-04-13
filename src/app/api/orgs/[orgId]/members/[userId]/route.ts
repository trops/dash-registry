/**
 * DELETE /api/orgs/[orgId]/members/[userId] — remove a member (admin only).
 *
 * Owners cannot be removed. Admins cannot remove themselves without first
 * transferring ownership (defers to removeMember in lib/orgs).
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { isAdmin, removeMember } from "@/lib/orgs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { orgId: string; userId: string } },
) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { orgId, userId } = params;
  if (!(await isAdmin(orgId, token.sub))) {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 },
    );
  }

  try {
    const removed = await removeMember(orgId, userId);
    if (!removed) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ removed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to remove member";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
