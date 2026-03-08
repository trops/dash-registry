/**
 * POST /api/auth/register
 *
 * Register a new user profile after Cognito sign-up.
 * Requires authentication. Creates the user's registry profile
 * with a unique username (scope for publishing).
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { createUser, getUserByCognitoId, getUserByUsername } from "@/lib/db";

const USERNAME_PATTERN = /^[a-z][a-z0-9-]*[a-z0-9]$/;

export async function POST(request: NextRequest) {
    const token = await authenticateRequest(request);
    if (!token) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    // Check if user already registered
    const existing = await getUserByCognitoId(token.sub);
    if (existing) {
        return NextResponse.json(
            { error: "User already registered", user: existing },
            { status: 409 },
        );
    }

    try {
        const body = await request.json();
        const { username, displayName, githubUsername } = body;

        // Validate username
        if (!username || typeof username !== "string") {
            return NextResponse.json(
                { error: "Username is required" },
                { status: 400 },
            );
        }

        if (username.length < 2 || username.length > 39) {
            return NextResponse.json(
                { error: "Username must be 2-39 characters" },
                { status: 400 },
            );
        }

        if (!USERNAME_PATTERN.test(username)) {
            return NextResponse.json(
                {
                    error: "Username must be lowercase, start with a letter, and contain only letters, numbers, and hyphens",
                },
                { status: 400 },
            );
        }

        // Check uniqueness
        const existingUser = await getUserByUsername(username);
        if (existingUser) {
            return NextResponse.json(
                { error: "Username is already taken" },
                { status: 409 },
            );
        }

        // Create user profile
        const user = await createUser({
            cognitoId: token.sub,
            username,
            email: token.email || "",
            displayName: displayName || username,
            githubUsername: githubUsername || undefined,
        });

        return NextResponse.json({ success: true, user });
    } catch (err) {
        console.error("[API /auth/register] Error:", err);
        return NextResponse.json(
            { error: "Failed to register user" },
            { status: 500 },
        );
    }
}
