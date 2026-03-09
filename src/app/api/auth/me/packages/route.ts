/**
 * GET /api/auth/me/packages
 *
 * List all packages owned by the authenticated user.
 * Requires authentication.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getUserByCognitoId, listPackagesByScope } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const user = await getUserByCognitoId(token.sub);
    if (!user) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const packages = await listPackagesByScope(user.username as string);

    // Sort by updatedAt descending
    packages.sort(
      (a, b) =>
        new Date(b.updatedAt as string).getTime() -
        new Date(a.updatedAt as string).getTime(),
    );

    return NextResponse.json({ packages });
  } catch (err) {
    console.error("[API /auth/me/packages] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch packages" },
      { status: 500 },
    );
  }
}
