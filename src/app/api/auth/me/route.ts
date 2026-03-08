/**
 * GET /api/auth/me
 *
 * Get the authenticated user's profile.
 * Requires authentication.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getUserByCognitoId } from "@/lib/db";

export async function GET(request: NextRequest) {
    const token = await authenticateRequest(request);
    if (!token) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const user = await getUserByCognitoId(token.sub);
    if (!user) {
        return NextResponse.json(
            { error: "User profile not found", needsRegistration: true },
            { status: 404 },
        );
    }

    return NextResponse.json({ user });
}
