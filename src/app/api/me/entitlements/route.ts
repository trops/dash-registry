/**
 * GET /api/me/entitlements
 *
 * Flat list of every entitlement the current user has access to — including
 * direct user grants and entitlements granted to orgs they're a member of.
 *
 * For Phase 1 the response is flat (one row per entitlement). Future shape:
 * group by package + annotate "granted via user direct | via org X".
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  listEntitlementsForGrantee,
  listOrgsForUser,
  type Entitlement,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const userId = token.sub;

    // Direct user entitlements
    const userEntitlements = await listEntitlementsForGrantee("user", userId);

    // Org entitlements (one query per org the user is in)
    const memberships = await listOrgsForUser(userId);
    const orgEntitlementLists = await Promise.all(
      memberships.map((m) => listEntitlementsForGrantee("org", m.orgId)),
    );
    const orgEntitlements = orgEntitlementLists.flat();

    // De-dupe by entitlementId (a user-direct and org grant for the same
    // package would otherwise show twice — direct wins for display)
    const seen = new Map<string, Entitlement>();
    for (const e of [...userEntitlements, ...orgEntitlements]) {
      if (e.revokedAt) continue;
      if (!seen.has(e.entitlementId)) {
        seen.set(e.entitlementId, e);
      }
    }
    const entitlements = Array.from(seen.values());

    return NextResponse.json({ entitlements });
  } catch (err) {
    console.error("[API /me/entitlements] Error:", err);
    return NextResponse.json(
      { error: "Failed to list entitlements" },
      { status: 500 },
    );
  }
}
