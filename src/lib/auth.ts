/**
 * Auth utilities for API route authentication.
 *
 * Validates Cognito JWT tokens from Authorization headers.
 */
import { NextRequest } from "next/server";

const COGNITO_REGION = process.env.COGNITO_REGION || "us-east-1";
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || "";
const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;

interface DecodedToken {
    sub: string;
    email?: string;
    "cognito:username"?: string;
    preferred_username?: string;
    token_use: string;
    exp: number;
    iss: string;
}

/**
 * Extract and validate the JWT token from a request.
 * Returns the decoded token payload or null if invalid.
 */
export async function authenticateRequest(
    request: NextRequest,
): Promise<DecodedToken | null> {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.slice(7);

    try {
        // Decode JWT payload (base64)
        const parts = token.split(".");
        if (parts.length !== 3) return null;

        const payload = JSON.parse(
            Buffer.from(parts[1], "base64url").toString(),
        ) as DecodedToken;

        // Verify issuer
        if (payload.iss !== COGNITO_ISSUER) {
            console.warn(
                "[Auth] Invalid issuer:",
                payload.iss,
                "expected:",
                COGNITO_ISSUER,
            );
            return null;
        }

        // Verify token type
        if (payload.token_use !== "access" && payload.token_use !== "id") {
            console.warn("[Auth] Invalid token_use:", payload.token_use);
            return null;
        }

        // Verify expiry
        if (payload.exp * 1000 < Date.now()) {
            console.warn("[Auth] Token expired");
            return null;
        }

        // In production, you should verify the JWT signature using JWKS.
        // For Phase 1, we trust the token if it has valid structure and claims.
        // TODO: Add full JWKS signature verification
        return payload;
    } catch (err) {
        console.error("[Auth] Token validation error:", err);
        return null;
    }
}

/**
 * Get the user's Cognito sub (user ID) from a request.
 */
export async function getUserId(
    request: NextRequest,
): Promise<string | null> {
    const token = await authenticateRequest(request);
    return token?.sub || null;
}
