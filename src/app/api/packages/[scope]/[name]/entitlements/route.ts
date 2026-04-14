/**
 * POST /api/packages/[scope]/[name]/entitlements
 *   Grant an entitlement for this package. Package owner only.
 *   Body: { granteeType, granteeId, seats?, expiresAt?, versionConstraint? }
 *
 * GET /api/packages/[scope]/[name]/entitlements
 *   List entitlements for this package. Package owner only.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  getPackage,
  putEntitlement,
  listEntitlementsForPackage,
  getUserByCognitoId,
  getOrg,
  type Entitlement,
} from "@/lib/db";
import { buildEntitlement } from "@/lib/entitlement";

/**
 * Resolve the handful of unique user-type grantees in an entitlement list
 * to their display info (username, displayName, avatarUrl). Returns a
 * map keyed by cognitoId so callers can attach grantee details to each
 * entitlement without rendering raw UUIDs.
 */
async function resolveUserGrantees(entitlements: Entitlement[]) {
  const userIds = new Set<string>();
  for (const e of entitlements) {
    if (e.granteeType === "user") userIds.add(e.granteeId);
    if (e.claimedByUserId) userIds.add(e.claimedByUserId);
  }
  const map: Record<string, { username: string; displayName?: string; avatarUrl?: string }> = {};
  await Promise.all(
    Array.from(userIds).map(async (id) => {
      const user = await getUserByCognitoId(id);
      if (user) {
        map[id] = {
          username: user.username as string,
          displayName: user.displayName as string | undefined,
          avatarUrl: user.avatarUrl as string | undefined,
        };
      }
    }),
  );
  return map;
}

async function requireOwner(
  request: NextRequest,
  scope: string,
  name: string,
) {
  const token = await authenticateRequest(request);
  if (!token) {
    return {
      error: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    };
  }
  const pkg = await getPackage(scope, name);
  if (!pkg) {
    return {
      error: NextResponse.json(
        { error: "Package not found" },
        { status: 404 },
      ),
    };
  }
  const ownerId = (pkg.ownerId || pkg.author) as string | undefined;
  if (ownerId !== token.sub) {
    return {
      error: NextResponse.json(
        { error: "Package not found" },
        { status: 404 },
      ),
    };
  }
  return { token, pkg };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { scope: string; name: string } },
) {
  const { scope, name } = params;
  const check = await requireOwner(request, scope, name);
  if ("error" in check) return check.error;

  try {
    const body = await request.json();
    const { granteeType, granteeId, seats, expiresAt, versionConstraint, source } =
      body || {};
    if (
      !granteeType ||
      !["user", "org", "email"].includes(granteeType)
    ) {
      return NextResponse.json(
        { error: "granteeType must be 'user', 'org', or 'email'" },
        { status: 400 },
      );
    }
    if (!granteeId || typeof granteeId !== "string") {
      return NextResponse.json(
        { error: "granteeId is required" },
        { status: 400 },
      );
    }
    if (
      granteeType === "email" &&
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(granteeId.trim())
    ) {
      return NextResponse.json(
        { error: "granteeId must be a valid email address" },
        { status: 400 },
      );
    }
    if (seats != null && (typeof seats !== "number" || seats < 1)) {
      return NextResponse.json(
        { error: "seats must be a positive integer or null" },
        { status: 400 },
      );
    }

    const entitlement = buildEntitlement({
      packageScope: scope,
      packageName: name,
      versionConstraint: versionConstraint || "*",
      granteeType,
      granteeId,
      seats: seats ?? null,
      expiresAt: expiresAt || null,
      source: source || "manual",
      createdByUserId: check.token.sub,
    });
    await putEntitlement(entitlement);
    return NextResponse.json({ entitlement }, { status: 201 });
  } catch (err) {
    console.error("[API /entitlements POST] Error:", err);
    return NextResponse.json(
      { error: "Failed to grant entitlement" },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { scope: string; name: string } },
) {
  const { scope, name } = params;
  const check = await requireOwner(request, scope, name);
  if ("error" in check) return check.error;

  try {
    const entitlements = await listEntitlementsForPackage(scope, name);
    const granteeInfo = await resolveUserGrantees(entitlements);

    // Resolve org grantees to slug+name for display.
    const orgIds = new Set<string>();
    for (const e of entitlements)
      if (e.granteeType === "org") orgIds.add(e.granteeId);
    const orgInfo: Record<string, { slug: string; name: string }> = {};
    await Promise.all(
      Array.from(orgIds).map(async (id) => {
        const org = await getOrg(id);
        if (org) orgInfo[id] = { slug: org.slug, name: org.name };
      }),
    );

    const enriched = entitlements.map((e) => ({
      ...e,
      grantee: e.granteeType === "user" ? granteeInfo[e.granteeId] || null : null,
      org: e.granteeType === "org" ? orgInfo[e.granteeId] || null : null,
      claimedByUser: e.claimedByUserId
        ? granteeInfo[e.claimedByUserId] || null
        : null,
    }));
    return NextResponse.json({ entitlements: enriched });
  } catch (err) {
    console.error("[API /entitlements GET] Error:", err);
    return NextResponse.json(
      { error: "Failed to list entitlements" },
      { status: 500 },
    );
  }
}
