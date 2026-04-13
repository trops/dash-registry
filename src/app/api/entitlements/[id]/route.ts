/**
 * DELETE /api/entitlements/[id]
 *
 * Revoke an entitlement. The caller must be the owner of the associated
 * package. Revocation is a soft-delete (sets revokedAt) so audit history
 * is preserved.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  getEntitlement,
  getPackage,
  revokeEntitlement,
} from "@/lib/db";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const entitlement = await getEntitlement(params.id);
    if (!entitlement) {
      return NextResponse.json(
        { error: "Entitlement not found" },
        { status: 404 },
      );
    }

    const pkg = await getPackage(
      entitlement.packageScope,
      entitlement.packageName,
    );
    const ownerId = (pkg?.ownerId || pkg?.author) as string | undefined;
    if (!pkg || ownerId !== token.sub) {
      return NextResponse.json(
        { error: "Entitlement not found" },
        { status: 404 },
      );
    }

    const updated = await revokeEntitlement(params.id);
    return NextResponse.json({ entitlement: updated });
  } catch (err) {
    console.error("[API /entitlements DELETE] Error:", err);
    return NextResponse.json(
      { error: "Failed to revoke entitlement" },
      { status: 500 },
    );
  }
}
