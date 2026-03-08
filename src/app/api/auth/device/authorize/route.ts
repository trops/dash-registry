/**
 * POST /api/auth/device/authorize
 *
 * Called by the device verification page after the user signs in.
 * Authorizes a pending device code so the Dash app can complete authentication.
 *
 * For Phase 1 (no Cognito UI on the website yet), this endpoint
 * authorizes the device code with a placeholder token.
 * When Amplify auth is deployed, this will require an authenticated session
 * and use the user's real Cognito token.
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeDeviceCode } from "@/lib/deviceFlow";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userCode } = body;

        if (!userCode || typeof userCode !== "string") {
            return NextResponse.json(
                { error: "userCode is required" },
                { status: 400 },
            );
        }

        // TODO: When Amplify auth is deployed on the website, validate the
        // user's session cookie/token here and use their real Cognito access token.
        // For Phase 1, we generate a placeholder token that will be used for
        // subsequent API calls. The registry API validates tokens against Cognito,
        // so real auth will be enforced at the API level.

        // Attempt to authorize the device code
        const authorized = authorizeDeviceCode(
            userCode.trim().toUpperCase(),
            "phase1-placeholder-token",
            "phase1-placeholder-user",
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
        return NextResponse.json(
            { error: "Failed to authorize device" },
            { status: 500 },
        );
    }
}
