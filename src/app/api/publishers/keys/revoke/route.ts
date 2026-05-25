/**
 * POST /api/publishers/keys/revoke
 *
 * The authenticated publisher revokes one of their own signing keys.
 * Idempotent: revoking an already-revoked key returns the existing
 * revokedAt timestamp.
 *
 * Body:
 *   { keyId: "<uuid>" }
 *
 * 200:
 *   { keyId, revokedAt }
 *
 * 400 — bad request (missing / malformed keyId)
 * 401 — not authenticated
 * 404 — the caller doesn't own a key with this id
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
    getPublisherKey,
    revokePublisherKey,
} from "@/lib/publisherKeys";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const token = await authenticateRequest(request);
    if (!token) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    let body: { keyId?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        );
    }

    const keyId = body?.keyId;
    if (typeof keyId !== "string" || keyId.length === 0) {
        return NextResponse.json(
            { error: "keyId is required" },
            { status: 400 },
        );
    }

    const existing = await getPublisherKey(token.sub, keyId);
    if (!existing) {
        // Don't disclose whether the key exists under another publisher
        // — 404 across the board.
        return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    if (existing.revokedAt) {
        return NextResponse.json({
            keyId,
            revokedAt: existing.revokedAt,
            alreadyRevoked: true,
        });
    }

    const updated = await revokePublisherKey(token.sub, keyId);
    return NextResponse.json({
        keyId,
        revokedAt: updated?.revokedAt,
        alreadyRevoked: false,
    });
}
