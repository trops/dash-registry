/**
 * Auth utilities for API route authentication.
 *
 * Validates Cognito JWT tokens using aws-jwt-verify — Amazon's official
 * library for Cognito JWT verification, designed for Lambda environments.
 */
import { NextRequest } from "next/server";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import outputs from "../../amplify_outputs.json";

// Lazy-initialized verifier — avoids build-time validation errors when
// amplify_outputs.json contains a placeholder User Pool ID.
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
    if (!verifier) {
        const userPoolId =
            process.env.COGNITO_USER_POOL_ID ||
            outputs.auth?.user_pool_id ||
            "";
        verifier = CognitoJwtVerifier.create({
            userPoolId,
            tokenUse: null,
            clientId: null,
        });
    }
    return verifier;
}

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
        const payload = await getVerifier().verify(token);
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
