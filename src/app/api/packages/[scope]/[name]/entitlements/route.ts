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
} from "@/lib/db";
import { buildEntitlement } from "@/lib/entitlement";

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
    if (!granteeType || (granteeType !== "user" && granteeType !== "org")) {
      return NextResponse.json(
        { error: "granteeType must be 'user' or 'org'" },
        { status: 400 },
      );
    }
    if (!granteeId || typeof granteeId !== "string") {
      return NextResponse.json(
        { error: "granteeId is required" },
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
    return NextResponse.json({ entitlements });
  } catch (err) {
    console.error("[API /entitlements GET] Error:", err);
    return NextResponse.json(
      { error: "Failed to list entitlements" },
      { status: 500 },
    );
  }
}
