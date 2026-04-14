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
import { getCognitoUserAttributes } from "@/lib/cognito";

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

  let user = await getUserByCognitoId(token.sub);
  if (!user) {
    return NextResponse.json(
      { error: "User profile not found", needsRegistration: true },
      { status: 404 },
    );
  }

  // Backfill fields that registration may have missed. Federated OAuth
  // (Google) tokens often omit email and picture from access tokens, so
  // the original register call stored empty strings. Here we pull the
  // canonical values from Cognito user attributes and persist them to
  // our Users table, self-healing on any /me call.
  const storedEmail = (user.email as string | undefined) || "";
  const storedAvatar = (user.avatarUrl as string | undefined) || "";
  const needsEmail = !storedEmail;
  const needsAvatar = !storedAvatar;

  if (needsEmail || needsAvatar) {
    const backfill: Parameters<typeof updateUser>[1] = {};
    if (needsEmail && token.email) {
      backfill.email = token.email.trim().toLowerCase();
    }
    // For fields not on the access token (picture), hit Cognito
    // AdminGetUser. Skip the call entirely if we don't need anything
    // from it — it's an extra network hop.
    if (needsAvatar || (needsEmail && !token.email)) {
      const attrs = await getCognitoUserAttributes(token.sub);
      if (attrs) {
        if (needsEmail && attrs.email && !backfill.email) {
          backfill.email = attrs.email.trim().toLowerCase();
        }
        if (needsAvatar && attrs.picture) {
          backfill.avatarUrl = attrs.picture;
        }
      }
    }
    if (Object.keys(backfill).length > 0) {
      const updated = await updateUser(token.sub, backfill);
      if (updated) user = updated;
    }
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
