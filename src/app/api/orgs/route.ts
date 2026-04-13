/**
 * POST /api/orgs — create a new org (caller becomes owner)
 * GET  /api/orgs — list the caller's orgs
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { createOrg, getOrgsForUser } from "@/lib/orgs";

export async function POST(request: NextRequest) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const { slug, name } = body || {};
    if (!slug || !name) {
      return NextResponse.json(
        { error: "slug and name are required" },
        { status: 400 },
      );
    }
    const org = await createOrg({
      slug,
      name,
      ownerUserId: token.sub,
    });
    return NextResponse.json({ org }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create org";
    const status = msg.includes("taken") || msg.includes("Invalid") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
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

  try {
    const orgs = await getOrgsForUser(token.sub);
    return NextResponse.json({ orgs });
  } catch (err) {
    console.error("[API /orgs GET] Error:", err);
    return NextResponse.json(
      { error: "Failed to list orgs" },
      { status: 500 },
    );
  }
}
