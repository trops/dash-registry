/**
 * GET /api/users/lookup?username=<username>
 * GET /api/users/lookup?email=<email>
 *
 * Resolve a username OR email to the user's canonical identity (cognitoId).
 * Used by the package access-management UI to turn "alice@example.com" (or
 * "alice") into a grantee_id for an entitlement.
 *
 * Auth required. The response intentionally excludes email even when the
 * caller queried by email — we don't want this endpoint to confirm email
 * enumeration beyond "does this email belong to a registered user". The
 * 404 path in the grant flow falls through to creating an email-pending
 * entitlement, so the caller doesn't learn whether an email is registered
 * until they commit to granting.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getUserByUsername, getUserByEmail } from "@/lib/db";

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
    const email = (searchParams.get("email") || "").trim().toLowerCase();

    if (!username && !email) {
        return NextResponse.json(
            { error: "username or email query param required" },
            { status: 400 },
        );
    }

    try {
        const user = email
            ? await getUserByEmail(email)
            : await getUserByUsername(username);
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
