/**
 * Ed25519 crypto utilities for the publisher signing flow.
 *
 * Cert format (intentionally simple — no ASN.1 / no X.509):
 *
 *   {
 *     "body": {
 *       "v": 1,
 *       "publisher_id": "<cognito sub>",
 *       "public_key": "<base64 Ed25519 public key>",
 *       "fingerprint": "<hex sha256(public_key bytes)>",
 *       "issued_at": "<ISO8601>",
 *       "expires_at": "<ISO8601>"
 *     },
 *     "sig": "<base64 Ed25519 signature over canonical-JSON(body)>"
 *   }
 *
 * The signature is computed against a *canonical* JSON serialization of
 * the body (sorted keys, no whitespace) so verifiers don't have to worry
 * about key ordering or formatting drift.
 *
 * The signing key is the registry root private key (Ed25519), stored in
 * AWS SSM SecureString. The verifying key is the registry root public
 * key — also in SSM for server self-checks; bundled into the
 * dash-electron binary for installer-side verification.
 */
import * as ed from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";

// @noble/ed25519 v3 requires the consumer to wire SHA-512 explicitly.
// We use @noble/hashes for the implementation — pure-JS, no Node-only
// APIs, Edge-runtime safe. The cast bridges the TS 5+ stricter typed-
// array variance (Uint8Array<ArrayBuffer> vs Uint8Array<ArrayBufferLike>).
ed.hashes.sha512 = sha512 as unknown as typeof ed.hashes.sha512;

// --- Encoding helpers ---

function bytesToBase64(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, "base64"));
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Canonical JSON: sort object keys recursively, no whitespace. Two
 * verifiers will compute byte-identical strings from semantically equal
 * payloads. This is what we sign over — never sign over an
 * unspecified-ordering JSON.stringify().
 */
export function canonicalJsonStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return "[" + value.map(canonicalJsonStringify).join(",") + "]";
    }
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts = keys.map((k) => {
        const v = (value as Record<string, unknown>)[k];
        return JSON.stringify(k) + ":" + canonicalJsonStringify(v);
    });
    return "{" + parts.join(",") + "}";
}

// --- Fingerprints ---

/**
 * Fingerprint of a public key: hex(sha256(base64-decoded key bytes)).
 * Stable identifier for the GSI lookup at install-time revocation check.
 */
export function computeFingerprint(publicKeyBase64: string): string {
    const bytes = base64ToBytes(publicKeyBase64);
    return bytesToHex(sha256(bytes));
}

// --- Key generation (for the registry root key; not for runtime use) ---

export async function generateKeypair(): Promise<{
    privateKey: string; // base64
    publicKey: string; // base64
}> {
    const privateBytes = ed.utils.randomSecretKey();
    const publicBytes = await ed.getPublicKeyAsync(privateBytes);
    return {
        privateKey: bytesToBase64(privateBytes),
        publicKey: bytesToBase64(publicBytes),
    };
}

// --- Cert issuance ---

export interface PublisherCertBody {
    v: 1;
    publisher_id: string;
    public_key: string; // base64
    fingerprint: string; // hex
    issued_at: string; // ISO8601
    expires_at: string; // ISO8601
}

export interface PublisherCert {
    body: PublisherCertBody;
    sig: string; // base64
}

/**
 * Sign a publisher cert with the registry root private key.
 * The body's `fingerprint` is recomputed here as a defense-in-depth
 * check — callers shouldn't supply it.
 */
export async function signPublisherCert(args: {
    publisherId: string;
    publisherPublicKey: string; // base64
    registryRootPrivateKey: string; // base64
    issuedAt?: Date;
    validForMs?: number;
}): Promise<PublisherCert> {
    const issuedAt = args.issuedAt ?? new Date();
    const validForMs = args.validForMs ?? 1000 * 60 * 60 * 24 * 365 * 2; // 2y
    const expiresAt = new Date(issuedAt.getTime() + validForMs);
    const body: PublisherCertBody = {
        v: 1,
        publisher_id: args.publisherId,
        public_key: args.publisherPublicKey,
        fingerprint: computeFingerprint(args.publisherPublicKey),
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
    };
    const message = new TextEncoder().encode(canonicalJsonStringify(body));
    const privateBytes = base64ToBytes(args.registryRootPrivateKey);
    const sigBytes = await ed.signAsync(message, privateBytes);
    return { body, sig: bytesToBase64(sigBytes) };
}

/**
 * Verify a publisher cert against the registry root public key.
 * Returns the verified body on success; throws on failure (bad sig,
 * expired, version mismatch).
 */
export async function verifyPublisherCert(args: {
    cert: PublisherCert;
    registryRootPublicKey: string; // base64
    now?: Date;
}): Promise<PublisherCertBody> {
    const { cert, registryRootPublicKey } = args;
    const now = args.now ?? new Date();
    if (cert.body.v !== 1) {
        throw new Error(`Unsupported cert version: ${cert.body.v}`);
    }
    if (computeFingerprint(cert.body.public_key) !== cert.body.fingerprint) {
        throw new Error("Cert fingerprint does not match public key");
    }
    if (new Date(cert.body.expires_at) < now) {
        throw new Error("Cert has expired");
    }
    const message = new TextEncoder().encode(canonicalJsonStringify(cert.body));
    const sigBytes = base64ToBytes(cert.sig);
    const rootPubBytes = base64ToBytes(registryRootPublicKey);
    const ok = await ed.verifyAsync(sigBytes, message, rootPubBytes);
    if (!ok) throw new Error("Cert signature verification failed");
    return cert.body;
}

// --- ZIP signature verification ---

/**
 * Verify a ZIP signature against a publisher's public key.
 * `signature` is the Ed25519 signature over sha256(zip bytes).
 * Used by both the publish endpoint (defense-in-depth check before
 * accepting an upload) and the installer (mandatory check before
 * mounting a downloaded package).
 */
export async function verifyZipSignature(args: {
    zipBytes: Uint8Array;
    signature: string; // base64
    publisherPublicKey: string; // base64
}): Promise<boolean> {
    const digest = sha256(args.zipBytes);
    const sigBytes = base64ToBytes(args.signature);
    const pubBytes = base64ToBytes(args.publisherPublicKey);
    return ed.verifyAsync(sigBytes, digest, pubBytes);
}

// --- Re-exports for callers that don't want to depend on @noble directly ---

export const _internal = {
    bytesToBase64,
    base64ToBytes,
    bytesToHex,
    sha256,
};
