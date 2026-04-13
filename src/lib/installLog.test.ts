/**
 * Unit tests for installLog.ts — IP hashing + client IP extraction.
 * putInstallLog is mocked; we test the framing, not the DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
    putInstallLog: vi.fn(),
}));

import { hashIp, extractClientIp, logInstallAttempt } from "./installLog";
import { putInstallLog } from "./db";

const mockPut = putInstallLog as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();
    process.env.INSTALL_LOG_IP_SALT = "test-salt";
});

describe("hashIp", () => {
    it("returns null for falsy or 'unknown' input", () => {
        expect(hashIp(null)).toBeNull();
        expect(hashIp(undefined)).toBeNull();
        expect(hashIp("")).toBeNull();
        expect(hashIp("unknown")).toBeNull();
    });

    it("is deterministic for the same salt + input", () => {
        const a = hashIp("203.0.113.7");
        const b = hashIp("203.0.113.7");
        expect(a).toBe(b);
        expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it("changes when the salt rotates", () => {
        const a = hashIp("203.0.113.7");
        process.env.INSTALL_LOG_IP_SALT = "rotated-salt";
        const b = hashIp("203.0.113.7");
        expect(a).not.toBe(b);
    });

    it("produces different hashes for different IPs", () => {
        expect(hashIp("1.2.3.4")).not.toBe(hashIp("5.6.7.8"));
    });
});

describe("extractClientIp", () => {
    it("prefers the leftmost x-forwarded-for entry", () => {
        const h = new Headers({
            "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2",
        });
        expect(extractClientIp(h)).toBe("203.0.113.7");
    });

    it("trims whitespace around the entry", () => {
        const h = new Headers({ "x-forwarded-for": "   203.0.113.7   " });
        expect(extractClientIp(h)).toBe("203.0.113.7");
    });

    it("falls back to x-real-ip when x-forwarded-for is absent", () => {
        const h = new Headers({ "x-real-ip": "198.51.100.9" });
        expect(extractClientIp(h)).toBe("198.51.100.9");
    });

    it("returns 'unknown' when no IP headers are present", () => {
        expect(extractClientIp(new Headers())).toBe("unknown");
    });
});

describe("logInstallAttempt", () => {
    it("writes a well-formed entry with 90-day TTL", async () => {
        await logInstallAttempt({
            userId: "user-1",
            packageScope: "acme",
            packageName: "widget",
            version: "1.0.0",
            result: "granted_public",
            entitlementId: null,
            ipHash: "deadbeef",
            userAgent: "Dash/0.1",
        });
        expect(mockPut).toHaveBeenCalledOnce();
        const entry = mockPut.mock.calls[0][0];
        expect(entry.userId).toBe("user-1");
        expect(entry.result).toBe("granted_public");
        expect(entry.sk).toMatch(/#public$/); // null entitlementId serializes as "public"
        expect(entry.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
        const days =
            (entry.expiresAt - Math.floor(Date.now() / 1000)) / (24 * 60 * 60);
        expect(days).toBeGreaterThan(89);
        expect(days).toBeLessThan(91);
    });

    it("uses the entitlementId in the sort key when present", async () => {
        await logInstallAttempt({
            userId: "user-1",
            packageScope: "acme",
            packageName: "widget",
            version: "1.0.0",
            result: "granted_entitlement",
            entitlementId: "ent_xyz",
            ipHash: null,
            userAgent: null,
        });
        const entry = mockPut.mock.calls[0][0];
        expect(entry.sk).toMatch(/#ent_xyz$/);
    });

    it("swallows DB errors — logging must never block install responses", async () => {
        mockPut.mockRejectedValueOnce(new Error("dynamo down"));
        await expect(
            logInstallAttempt({
                userId: "u",
                packageScope: "a",
                packageName: "b",
                version: "1",
                result: "granted_public",
                entitlementId: null,
                ipHash: null,
                userAgent: null,
            }),
        ).resolves.toBeUndefined();
    });
});
