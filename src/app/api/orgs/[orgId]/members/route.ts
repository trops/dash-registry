/**
 * POST /api/orgs/[orgId]/members — add a member by userId OR email (admin only)
 * GET  /api/orgs/[orgId]/members — list members with display info (member only)
 *
 * Members must be existing registered users — org memberships don't
 * support pre-invite by unregistered email (unlike package entitlements).
 * If you want to grant access to someone who hasn't signed up yet, create
 * a package-level email entitlement instead.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { addMember, getMembers, isAdmin, isMember } from "@/lib/orgs";
import { getUserByCognitoId, getUserByEmail, getUserByUsername } from "@/lib/db";

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
    const { userId, email, username, role } = body || {};
    if (!userId && !email && !username) {
      return NextResponse.json(
        { error: "userId, email, or username is required" },
        { status: 400 },
      );
    }
    if (role && !["member", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "role must be 'member' or 'admin'" },
        { status: 400 },
      );
    }

    // Resolve to a canonical userId. Org membership requires an existing
    // registered user — pre-invite flow is package-entitlement-only.
    let resolvedUserId = userId;
    if (!resolvedUserId && email) {
      const u = await getUserByEmail(email);
      if (!u) {
        return NextResponse.json(
          {
            error: "No registered user with that email. Ask them to sign up first, or grant the package directly by email.",
          },
          { status: 404 },
        );
      }
      resolvedUserId = u.cognitoId;
    }
    if (!resolvedUserId && username) {
      const u = await getUserByUsername(username);
      if (!u) {
        return NextResponse.json(
          { error: `No user with username "${username}"` },
          { status: 404 },
        );
      }
      resolvedUserId = u.cognitoId;
    }

    const membership = await addMember(orgId, resolvedUserId, role);
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
    // Enrich with display info so the UI doesn't show raw cognito IDs.
    const enriched = await Promise.all(
      members.map(async (m) => {
        const user = await getUserByCognitoId(m.userId);
        return {
          ...m,
          user: user
            ? {
                username: user.username as string,
                displayName: user.displayName as string | undefined,
                avatarUrl: user.avatarUrl as string | undefined,
              }
            : null,
        };
      }),
    );
    return NextResponse.json({ members: enriched });
  } catch (err) {
    console.error("[API /orgs/members GET] Error:", err);
    return NextResponse.json(
      { error: "Failed to list members" },
      { status: 500 },
    );
  }
}
