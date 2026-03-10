/**
 * Auth utilities for API route authentication.
 *
 * Validates Cognito JWT tokens using aws-jwt-verify — Amazon's official
 * library for Cognito JWT verification, designed for Lambda environments.
 */
import { NextRequest } from "next/server";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import outputs from "../../amplify_outputs.json";

const COGNITO_USER_POOL_ID =
    process.env.COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id || "";

// Verifier handles JWKS fetching, caching, and RS256 verification internally
const verifier = CognitoJwtVerifier.create({
    userPoolId: COGNITO_USER_POOL_ID,
    tokenUse: null, // accept both "access" and "id" tokens
    clientId: null, // don't validate clientId
});

export interface DecodedToken {
    sub: string;
    email?: string;
    "cognito:username"?: string;
    preferred_username?: string;
    token_use: string;
    exp: number;
    iss: string;
}

/**
 * Extract and verify the JWT token from a request.
 * Verifies the RS256 signature against Cognito JWKS.
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
        const payload = await verifier.verify(token);
        return payload as unknown as DecodedToken;
    } catch (err) {
        console.warn("[Auth] JWT verification failed:", err);
        return null;
    }
}

/**
 * Get the user's Cognito sub (user ID) from a request.
 */
export async function getUserId(request: NextRequest): Promise<string | null> {
    const token = await authenticateRequest(request);
    return token?.sub || null;
}
