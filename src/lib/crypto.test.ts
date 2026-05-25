import { describe, it, expect } from "vitest";
import {
    canonicalJsonStringify,
    computeFingerprint,
    generateKeypair,
    signPublisherCert,
    verifyPublisherCert,
    verifyZipSignature,
    _internal,
} from "./crypto";
import * as ed from "@noble/ed25519";

describe("canonicalJsonStringify", () => {
    it("sorts object keys recursively", () => {
        const a = canonicalJsonStringify({ b: 2, a: 1, c: { y: 2, x: 1 } });
        const b = canonicalJsonStringify({ c: { x: 1, y: 2 }, a: 1, b: 2 });
        expect(a).toBe(b);
        expect(a).toBe('{"a":1,"b":2,"c":{"x":1,"y":2}}');
    });

    it("preserves array order", () => {
        expect(canonicalJsonStringify([3, 1, 2])).toBe("[3,1,2]");
    });

    it("handles primitives", () => {
        expect(canonicalJsonStringify(null)).toBe("null");
        expect(canonicalJsonStringify("hi")).toBe('"hi"');
        expect(canonicalJsonStringify(42)).toBe("42");
    });
});

describe("computeFingerprint", () => {
    it("is deterministic for a given public key", () => {
        const pk = _internal.bytesToBase64(new Uint8Array(32).fill(7));
        expect(computeFingerprint(pk)).toBe(computeFingerprint(pk));
    });

    it("produces a 64-char hex string (sha256)", () => {
        const pk = _internal.bytesToBase64(new Uint8Array(32).fill(7));
        const fp = computeFingerprint(pk);
        expect(fp).toMatch(/^[0-9a-f]{64}$/);
    });

    it("differs for different keys", () => {
        const a = _internal.bytesToBase64(new Uint8Array(32).fill(1));
        const b = _internal.bytesToBase64(new Uint8Array(32).fill(2));
        expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
    });
});

describe("generateKeypair", () => {
    it("produces valid Ed25519 keys", async () => {
        const { privateKey, publicKey } = await generateKeypair();
        expect(privateKey).toMatch(/^[A-Za-z0-9+/=]+$/);
        expect(publicKey).toMatch(/^[A-Za-z0-9+/=]+$/);
        // 32-byte raw Ed25519 keys → 44-char base64 (with padding).
        expect(Buffer.from(privateKey, "base64").length).toBe(32);
        expect(Buffer.from(publicKey, "base64").length).toBe(32);
    });

    it("produces unique keys per call", async () => {
        const a = await generateKeypair();
        const b = await generateKeypair();
        expect(a.privateKey).not.toBe(b.privateKey);
    });
});

describe("sign + verify publisher cert", () => {
    it("round-trips", async () => {
        const registry = await generateKeypair();
        const publisher = await generateKeypair();
        const cert = await signPublisherCert({
            publisherId: "user-abc",
            publisherPublicKey: publisher.publicKey,
            registryRootPrivateKey: registry.privateKey,
        });
        const body = await verifyPublisherCert({
            cert,
            registryRootPublicKey: registry.publicKey,
        });
        expect(body.publisher_id).toBe("user-abc");
        expect(body.public_key).toBe(publisher.publicKey);
        expect(body.v).toBe(1);
    });

    it("rejects a cert signed by the wrong root key", async () => {
        const realRoot = await generateKeypair();
        const fakeRoot = await generateKeypair();
        const publisher = await generateKeypair();
        const cert = await signPublisherCert({
            publisherId: "user-abc",
            publisherPublicKey: publisher.publicKey,
            registryRootPrivateKey: fakeRoot.privateKey,
        });
        await expect(
            verifyPublisherCert({
                cert,
                registryRootPublicKey: realRoot.publicKey,
            }),
        ).rejects.toThrow(/signature verification failed/);
    });

    it("rejects a cert whose body has been tampered", async () => {
        const registry = await generateKeypair();
        const publisher = await generateKeypair();
        const cert = await signPublisherCert({
            publisherId: "user-abc",
            publisherPublicKey: publisher.publicKey,
            registryRootPrivateKey: registry.privateKey,
        });
        cert.body.publisher_id = "user-attacker";
        await expect(
            verifyPublisherCert({
                cert,
                registryRootPublicKey: registry.publicKey,
            }),
        ).rejects.toThrow(/signature verification failed/);
    });

    it("rejects an expired cert", async () => {
        const registry = await generateKeypair();
        const publisher = await generateKeypair();
        // Issued 3y ago, default 2y validity → expired.
        const issuedAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 3);
        const cert = await signPublisherCert({
            publisherId: "user-abc",
            publisherPublicKey: publisher.publicKey,
            registryRootPrivateKey: registry.privateKey,
            issuedAt,
        });
        await expect(
            verifyPublisherCert({
                cert,
                registryRootPublicKey: registry.publicKey,
            }),
        ).rejects.toThrow(/expired/);
    });
});

describe("verifyZipSignature", () => {
    it("verifies a valid ZIP signature", async () => {
        const publisher = await generateKeypair();
        const zip = new TextEncoder().encode("pretend this is a zip");
        // Sign over sha256(zip) using the publisher's private key.
        const digest = _internal.sha256(zip);
        const sigBytes = await ed.signAsync(
            digest,
            _internal.base64ToBytes(publisher.privateKey),
        );
        const sig = _internal.bytesToBase64(sigBytes);
        const ok = await verifyZipSignature({
            zipBytes: zip,
            signature: sig,
            publisherPublicKey: publisher.publicKey,
        });
        expect(ok).toBe(true);
    });

    it("rejects a signature over different bytes", async () => {
        const publisher = await generateKeypair();
        const zipA = new TextEncoder().encode("zip A");
        const zipB = new TextEncoder().encode("zip B");
        const digest = _internal.sha256(zipA);
        const sigBytes = await ed.signAsync(
            digest,
            _internal.base64ToBytes(publisher.privateKey),
        );
        const sig = _internal.bytesToBase64(sigBytes);
        const ok = await verifyZipSignature({
            zipBytes: zipB,
            signature: sig,
            publisherPublicKey: publisher.publicKey,
        });
        expect(ok).toBe(false);
    });
});
