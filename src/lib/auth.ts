/**
 * Auth utilities for API route authentication.
 *
 * Validates Cognito JWT tokens using JWKS signature verification.
 */
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const COGNITO_REGION = process.env.COGNITO_REGION || "us-east-1";
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || "";
const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;
const JWKS_URI = `${COGNITO_ISSUER}/.well-known/jwks.json`;

// JWKS client with 10-minute cache
const client = jwksClient({
    jwksUri: JWKS_URI,
    cache: true,
    cacheMaxAge: 600000,
    rateLimit: true,
    jwksRequestsPerMinute: 10,
});

function getSigningKey(kid: string): Promise<string> {
    return new Promise((resolve, reject) => {
        client.getSigningKey(kid, (err, key) => {
            if (err) return reject(err);
            if (!key) return reject(new Error("No signing key found"));
            resolve(key.getPublicKey());
        });
    });
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
        // Decode header to get the kid
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || typeof decoded === "string" || !decoded.header.kid) {
            console.warn("[Auth] Invalid JWT structure");
            return null;
        }

        // Fetch signing key from JWKS
        const signingKey = await getSigningKey(decoded.header.kid);

        // Verify signature, issuer, and expiry
        const payload = jwt.verify(token, signingKey, {
            algorithms: ["RS256"],
            issuer: COGNITO_ISSUER,
        }) as DecodedToken;

        // Verify token type
        if (payload.token_use !== "access" && payload.token_use !== "id") {
            console.warn("[Auth] Invalid token_use:", payload.token_use);
            return null;
        }

        return payload;
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            console.warn("[Auth] Token expired");
        } else if (err instanceof jwt.JsonWebTokenError) {
            console.warn("[Auth] JWT verification failed:", err.message);
        } else {
            console.error("[Auth] Token validation error:", err);
        }
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
