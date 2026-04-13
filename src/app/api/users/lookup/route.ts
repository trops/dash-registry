/**
 * GET /api/users/lookup?username=<username>
 *
 * Resolve a username to the user's canonical identity (cognitoId). Used by
 * the package access-management UI to turn "bob" into a grantee_id for an
 * entitlement.
 *
 * Auth required (any signed-in user can look up any other user). We don't
 * expose email in the response — it's not needed for entitlement granting
 * and returning it enables user-scraping.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getUserByUsername } from "@/lib/db";

export async function GET(request: NextRequest) {
    const token = await authenticateRequest(request);
    if (!token) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const { searchParams } = new URL(request.url);
    const username = (searchParams.get("username") || "").trim().toLowerCase();
    if (!username) {
        return NextResponse.json(
            { error: "username query param required" },
            { status: 400 },
        );
    }

    try {
        const user = await getUserByUsername(username);
        if (!user) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 },
            );
        }
        return NextResponse.json({
            cognitoId: user.cognitoId,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
        });
    } catch (err) {
        console.error("[API /users/lookup] Error:", err);
        return NextResponse.json(
            { error: "Failed to look up user" },
            { status: 500 },
        );
    }
}
