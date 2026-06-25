/**
 * POST /api/auth/device/authorize
 *
 * Called by the device verification page after the user signs in.
 * Authorizes a pending device code with the user's real Cognito JWT
 * so the Dash app can complete authentication.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { authorizeDeviceCode } from "@/lib/deviceFlow";

export async function POST(request: NextRequest) {
    try {
        // Verify the user's Cognito token
        const token = await authenticateRequest(request);
        if (!token) {
            return NextResponse.json(
                { error: "Authentication required. Please sign in first." },
                { status: 401 },
            );
        }

        const body = await request.json();
        const { userCode, refreshToken, cognitoClientId } = body;

        if (!userCode || typeof userCode !== "string") {
            return NextResponse.json(
                { error: "userCode is required" },
                { status: 400 },
            );
        }

        // Extract the raw JWT to pass through to the Dash app
        const rawJwt = request.headers.get("Authorization")!.slice(7);

        // Authorize the device code with the real Cognito token. The browser
        // also forwards its Cognito refresh token (+ the client id it belongs
        // to) when available so the desktop app can refresh its access token
        // directly against Cognito instead of breaking after ~1h. Both are
        // optional strings — anything non-string is dropped.
        const authorized = await authorizeDeviceCode(
            userCode.trim().toUpperCase(),
            rawJwt,
            token.sub,
            {
                refreshToken:
                    typeof refreshToken === "string" ? refreshToken : undefined,
                cognitoClientId:
                    typeof cognitoClientId === "string"
                        ? cognitoClientId
                        : undefined,
            },
        );

        if (!authorized) {
            return NextResponse.json(
                {
                    error: "Invalid or expired device code. Please check the code and try again.",
                },
                { status: 400 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[API /auth/device/authorize] Error:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json(
            { error: `Failed to authorize device: ${message}` },
            { status: 500 },
        );
    }
}
