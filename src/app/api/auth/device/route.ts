/**
 * POST /api/auth/device — Initiate device code flow
 * GET  /api/auth/device — Poll for token (with device_code query param)
 *
 * OAuth device code flow for the Dash desktop app.
 * The app displays a code, user visits a URL to authenticate in their browser,
 * and the app polls until authentication completes.
 */
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { deviceCodes, cleanupExpired } from "@/lib/deviceFlow";

/**
 * POST — Initiate device flow
 * Returns device_code, user_code, and verification URL
 */
export async function POST() {
    cleanupExpired();

    const deviceCode = uuidv4();
    // Generate a short, human-friendly user code (8 chars, uppercase)
    const userCode = uuidv4().slice(0, 8).toUpperCase();

    const registryBaseUrl =
        process.env.REGISTRY_BASE_URL || "https://registry.trops.dev";

    deviceCodes.set(deviceCode, {
        userCode,
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
        interval: 5, // poll every 5 seconds
        status: "pending",
    });

    return NextResponse.json({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: `${registryBaseUrl}/device`,
        verification_uri_complete: `${registryBaseUrl}/device?code=${userCode}`,
        expires_in: 900, // 15 minutes
        interval: 5,
    });
}

/**
 * GET — Poll for authorization status
 * Query params: ?device_code=
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const deviceCode = searchParams.get("device_code");

    if (!deviceCode) {
        return NextResponse.json(
            { error: "device_code is required" },
            { status: 400 },
        );
    }

    const entry = deviceCodes.get(deviceCode);
    if (!entry) {
        return NextResponse.json(
            { error: "expired_token", error_description: "Device code not found or expired" },
            { status: 400 },
        );
    }

    if (Date.now() > entry.expiresAt) {
        deviceCodes.delete(deviceCode);
        return NextResponse.json(
            { error: "expired_token", error_description: "Device code expired" },
            { status: 400 },
        );
    }

    if (entry.status === "pending") {
        return NextResponse.json(
            { error: "authorization_pending" },
            { status: 428 },
        );
    }

    if (entry.status === "authorized" && entry.token) {
        // Clean up after successful authorization
        deviceCodes.delete(deviceCode);

        return NextResponse.json({
            access_token: entry.token,
            token_type: "Bearer",
            user_id: entry.userId,
        });
    }

    return NextResponse.json(
        { error: "authorization_pending" },
        { status: 428 },
    );
}
