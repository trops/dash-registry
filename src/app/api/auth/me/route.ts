/**
 * GET /api/auth/me — Get the authenticated user's profile.
 * PATCH /api/auth/me — Update profile fields (displayName, githubUsername).
 *
 * Requires authentication.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  getUserByCognitoId,
  updateUser,
  listEntitlementsForGrantee,
  claimEmailEntitlement,
} from "@/lib/db";

/**
 * Best-effort conversion of email-pending entitlements into user grants
 * once a matching verified email signs in. Runs opportunistically on /me.
 * Failures are swallowed — /me should never fail because of claim issues.
 */
async function claimPendingForUser(userId: string, email: string) {
  try {
    const normalized = email.trim().toLowerCase();
    const pending = await listEntitlementsForGrantee("email", normalized);
    for (const e of pending) {
      if (e.revokedAt || e.claimedByUserId) continue;
      await claimEmailEntitlement(e.entitlementId, userId);
    }
  } catch (err) {
    console.warn("[auth/me] Claim-pending failed (non-fatal):", err);
  }
}

export async function GET(request: NextRequest) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const user = await getUserByCognitoId(token.sub);
  if (!user) {
    return NextResponse.json(
      { error: "User profile not found", needsRegistration: true },
      { status: 404 },
    );
  }

  const email = (user.email as string | undefined) || token.email || null;
  if (email) {
    await claimPendingForUser(token.sub, email);
  }

  return NextResponse.json({ user });
}

export async function PATCH(request: NextRequest) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = await request.json();
  const { displayName, githubUsername } = body as {
    displayName?: string;
    githubUsername?: string;
  };

  if (!displayName && !githubUsername) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const updates: { displayName?: string; githubUsername?: string } = {};
  if (displayName !== undefined) updates.displayName = displayName.trim();
  if (githubUsername !== undefined)
    updates.githubUsername = githubUsername.trim();

  const updated = await updateUser(token.sub, updates);
  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user: updated });
}
