/**
 * POST /api/publishers/keys/issue-cert
 *
 * The authenticated publisher's dash-electron app POSTs their freshly
 * generated public key (and a machine label) here. The registry signs
 * the public key with the registry root private key and returns a
 * `PublisherCert`. The new key is written to the PublisherKeys table.
 *
 * Body:
 *   { publicKey: "<base64 Ed25519>", machineLabel: "<string>" }
 *
 * 201:
 *   { keyId, fingerprint, cert: { body, sig } }
 *
 * 400 — bad request (missing / malformed public key)
 * 401 — not authenticated
 * 409 — this fingerprint is already registered to a different publisher
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authenticateRequest } from "@/lib/auth";
import { signPublisherCert, computeFingerprint } from "@/lib/crypto";
import {
    getPublisherKeyByFingerprint,
    putPublisherKey,
} from "@/lib/publisherKeys";
import { getRegistryRootKeys } from "@/lib/registryRootKey";

// SSM + Ed25519 + DynamoDB require Node runtime (not Edge).
export const runtime = "nodejs";

const BASE64_RE = /^[A-Za-z0-9+/=]+$/;
const ED25519_PUBLIC_KEY_BYTES = 32;

export async function POST(request: NextRequest) {
    const token = await authenticateRequest(request);
    if (!token) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    let body: { publicKey?: unknown; machineLabel?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        );
    }

    const publicKey = body?.publicKey;
    const machineLabel = body?.machineLabel;

    if (typeof publicKey !== "string" || !BASE64_RE.test(publicKey)) {
        return NextResponse.json(
            { error: "publicKey must be base64-encoded" },
            { status: 400 },
        );
    }

    let decoded: Buffer;
    try {
        decoded = Buffer.from(publicKey, "base64");
    } catch {
        return NextResponse.json(
            { error: "publicKey must be valid base64" },
            { status: 400 },
        );
    }
    if (decoded.length !== ED25519_PUBLIC_KEY_BYTES) {
        return NextResponse.json(
            {
                error: `publicKey must decode to ${ED25519_PUBLIC_KEY_BYTES} bytes (got ${decoded.length})`,
            },
            { status: 400 },
        );
    }

    if (
        typeof machineLabel !== "string" ||
        machineLabel.trim().length === 0 ||
        machineLabel.length > 64
    ) {
        return NextResponse.json(
            { error: "machineLabel is required (1-64 characters)" },
            { status: 400 },
        );
    }

    const fingerprint = computeFingerprint(publicKey);

    // Defense-in-depth: refuse to re-issue a cert for a key fingerprint
    // already registered under a *different* publisher. (Same publisher
    // re-registering an existing key is also blocked here — they should
    // hit the existing row instead.)
    const existing = await getPublisherKeyByFingerprint(fingerprint);
    if (existing) {
        const sameOwner = existing.publisherId === token.sub;
        return NextResponse.json(
            {
                error: sameOwner
                    ? "This key is already registered for your account"
                    : "This key is already registered",
                keyId: sameOwner ? existing.keyId : undefined,
            },
            { status: 409 },
        );
    }

    const { privateKey: rootPrivateKey } = await getRegistryRootKeys();

    const cert = await signPublisherCert({
        publisherId: token.sub,
        publisherPublicKey: publicKey,
        registryRootPrivateKey: rootPrivateKey,
    });

    const keyId = randomUUID();
    const createdAt = new Date().toISOString();

    await putPublisherKey({
        publisherId: token.sub,
        keyId,
        publicKey,
        fingerprint,
        machineLabel: machineLabel.trim(),
        createdAt,
        cert,
    });

    return NextResponse.json(
        { keyId, fingerprint, cert, createdAt },
        { status: 201 },
    );
}
