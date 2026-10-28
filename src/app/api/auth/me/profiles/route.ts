/**
 * GET /api/auth/me/profiles — the Dash profiles kept in the signed-in
 * user's account: id, name, revision, when and from which computer each
 * was last saved (lib/accountProfiles). Requires authentication.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { listAccountProfiles } from "@/lib/db";
import { isListedProfile, profileSummary } from "@/lib/accountProfiles";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  try {
    const items = await listAccountProfiles(token.sub);
    const profiles = (items as unknown[])
      // The list fetches no body: check only what it fetches.
      .filter(isListedProfile)
      .map(profileSummary)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return NextResponse.json({ profiles });
  } catch (err) {
    console.error("[API GET /auth/me/profiles] Error:", err);
    return NextResponse.json(
      { error: "Failed to list profiles" },
      { status: 500 },
    );
  }
}
