/**
 * GET /api/auth/me — Get the authenticated user's profile.
 * PATCH /api/auth/me — Update profile fields (displayName, githubUsername).
 *
 * Requires authentication.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getUserByCognitoId, updateUser } from "@/lib/db";

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
