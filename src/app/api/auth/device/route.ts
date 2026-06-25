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
import {
  createDeviceCode,
  getDeviceCode,
  deleteDeviceCode,
} from "@/lib/deviceFlow";

/**
 * POST — Initiate device flow
 * Returns device_code, user_code, and verification URL
 */
export async function POST(request: NextRequest) {
  const deviceCode = uuidv4();
  // Generate a short, human-friendly user code (8 chars, uppercase)
  const userCode = uuidv4().slice(0, 8).toUpperCase();

  const registryBaseUrl =
    process.env.REGISTRY_BASE_URL ||
    `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("host")}`;

  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

  await createDeviceCode(deviceCode, userCode, expiresAt, 5);

  return NextResponse.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${registryBaseUrl}/device`,
    verification_uri_complete: `${registryBaseUrl}/device/${userCode}`,
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

  const entry = await getDeviceCode(deviceCode);
  if (!entry) {
    return NextResponse.json(
      {
        error: "expired_token",
        error_description: "Device code not found or expired",
      },
      { status: 400 },
    );
  }

  if (Date.now() > entry.expiresAt) {
    await deleteDeviceCode(deviceCode);
    return NextResponse.json(
      {
        error: "expired_token",
        error_description: "Device code expired",
      },
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
    await deleteDeviceCode(deviceCode);

    // Hand the desktop app the Cognito refresh token (+ the client id /
    // region it needs to call Cognito) alongside the access token, when the
    // browser forwarded them. The app stores the refresh token encrypted and
    // uses it to mint fresh access tokens directly against Cognito on expiry.
    // Region comes from the registry's own deployment region — the user pool
    // lives in the same region. Older clients that didn't send a refresh
    // token just get the access token, exactly as before.
    return NextResponse.json({
      access_token: entry.token,
      token_type: "Bearer",
      user_id: entry.userId,
      refresh_token: entry.refreshToken,
      cognito_client_id: entry.cognitoClientId,
      cognito_region: process.env.AWS_REGION || "us-east-1",
    });
  }

  return NextResponse.json({ error: "authorization_pending" }, { status: 428 });
}
