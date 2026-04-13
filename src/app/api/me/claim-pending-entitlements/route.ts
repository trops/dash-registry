/**
 * POST /api/me/claim-pending-entitlements
 *
 * Called by the authenticated session (either explicitly or as a side
 * effect from /api/auth/me) to convert email-pending entitlements into
 * user grants once a matching verified email signs in.
 *
 * The user's email is resolved from the Users table (not from the JWT)
 * to guarantee it matches what was recorded at registration, which
 * required verified Cognito credentials.
 *
 * Returns the number of claimed entitlements.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  getUserByCognitoId,
  listEntitlementsForGrantee,
  claimEmailEntitlement,
} from "@/lib/db";

export async function POST(request: NextRequest) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const user = await getUserByCognitoId(token.sub);
    const email =
      (user?.email as string | undefined) || token.email || null;
    if (!email) {
      return NextResponse.json({ claimed: 0 });
    }

    const normalized = email.trim().toLowerCase();
    const pending = await listEntitlementsForGrantee("email", normalized);
    const claimable = pending.filter(
      (e) => !e.revokedAt && !e.claimedByUserId,
    );

    const claimed = [];
    for (const e of claimable) {
      const updated = await claimEmailEntitlement(e.entitlementId, token.sub);
      if (updated) claimed.push(updated);
    }

    return NextResponse.json({
      claimed: claimed.length,
      entitlements: claimed,
    });
  } catch (err) {
    console.error("[API /me/claim-pending-entitlements] Error:", err);
    return NextResponse.json(
      { error: "Failed to claim entitlements" },
      { status: 500 },
    );
  }
}
