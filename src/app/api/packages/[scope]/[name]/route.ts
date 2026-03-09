/**
 * GET /api/packages/[scope]/[name]  — public package details + versions
 * PATCH /api/packages/[scope]/[name] — update package metadata (owner only)
 */
import { NextRequest, NextResponse } from "next/server";
import { getPackage, getPackageVersions, updatePackage } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: { scope: string; name: string } },
) {
  try {
    const { scope, name } = params;

    const pkg = await getPackage(scope, name);
    if (!pkg) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    // Only return public packages
    if (pkg.visibility === "private") {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    // Get version history
    const versions = await getPackageVersions(scope, name);

    // Sort versions by createdAt descending
    versions.sort(
      (a, b) =>
        new Date(b.createdAt as string).getTime() -
        new Date(a.createdAt as string).getTime(),
    );

    return NextResponse.json({
      ...pkg,
      versions: versions.map((v) => ({
        version: v.version,
        createdAt: v.createdAt,
        fileSize: v.fileSize,
        widgets: v.widgets,
      })),
    });
  } catch (err) {
    console.error("[API /packages/[scope]/[name]] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch package" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { scope: string; name: string } },
) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const { scope, name } = params;

    const pkg = await getPackage(scope, name);
    if (!pkg) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    if (pkg.ownerId !== token.sub) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const allowedFields = [
      "description",
      "category",
      "tags",
      "visibility",
      "displayName",
    ];
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (
      updates.visibility &&
      updates.visibility !== "public" &&
      updates.visibility !== "private"
    ) {
      return NextResponse.json(
        { error: "Visibility must be 'public' or 'private'" },
        { status: 400 },
      );
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const updated = await updatePackage(scope, name, updates);
    return NextResponse.json({ package: updated });
  } catch (err) {
    console.error("[API PATCH /packages/[scope]/[name]] Error:", err);
    return NextResponse.json(
      { error: "Failed to update package" },
      { status: 500 },
    );
  }
}
