/**
 * Unit tests for installLog.ts — IP hashing + client IP extraction.
 * putInstallLog is mocked; we test the framing, not the DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
    putInstallLog: vi.fn(),
    countInstallLogSince: vi.fn(),
}));

import {
    hashIp,
    extractClientIp,
    logInstallAttempt,
    parseInstallId,
    anonymousLogKey,
    isAnonymousRateLimited,
    ANON_RATE_LIMIT,
} from "./installLog";
import { putInstallLog, countInstallLogSince } from "./db";

const mockPut = putInstallLog as unknown as ReturnType<typeof vi.fn>;
const mockCount = countInstallLogSince as unknown as ReturnType<typeof vi.fn>;

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
    it("skips internal proxy hops after the viewer", () => {
        const h = new Headers({
            "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2",
        });
        expect(extractClientIp(h)).toBe("203.0.113.7");
    });

    it("ignores addresses the client put in front (CloudFront appends the real one)", () => {
        const h = new Headers({
            "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.7, 172.16.0.9",
        });
        expect(extractClientIp(h)).toBe("203.0.113.7");
    });

    it("only internal hops: falls back to x-real-ip", () => {
        const h = new Headers({
            "x-forwarded-for": "10.0.0.1, 192.168.1.1",
            "x-real-ip": "198.51.100.9",
        });
        expect(extractClientIp(h)).toBe("198.51.100.9");
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
        // The real logInstallAttempt logs to console.error on failure.
        // Silence it here so the test run output stays clean.
        const errSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
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
        expect(errSpy).toHaveBeenCalledOnce();
        errSpy.mockRestore();
    });
});

describe("anonymous downloads", () => {
    it("keeps only a UUID install ID", () => {
        expect(parseInstallId("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(
            "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        );
        expect(parseInstallId("not-an-id")).toBeNull();
        expect(parseInstallId("")).toBeNull();
        expect(parseInstallId(null)).toBeNull();
    });

    it("logs signed-out downloads under the hashed IP", () => {
        expect(anonymousLogKey("abc")).toBe("anon:abc");
        expect(anonymousLogKey(null)).toBe("anon:unknown");
    });

    it("an entry is an install unless it says otherwise", async () => {
        await logInstallAttempt({
            userId: "u",
            packageScope: "s",
            packageName: "n",
            version: "1",
            result: "granted_public",
            entitlementId: null,
            ipHash: null,
            userAgent: null,
        });
        expect(mockPut.mock.calls[0][0].purpose).toBe("install");
    });

    it("stores the install ID with the entry", async () => {
        await logInstallAttempt({
            userId: "anon:abc",
            packageScope: "trops",
            packageName: "clock",
            version: "1.0.0",
            result: "granted_public",
            entitlementId: null,
            ipHash: "abc",
            userAgent: "Dash",
            installId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        });
        expect(mockPut.mock.calls[0][0]).toMatchObject({
            userId: "anon:abc",
            installId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        });
    });

    it("rate-limits an IP at the limit within the window", async () => {
        const now = Date.parse("2026-10-23T12:00:00.000Z");
        mockCount.mockResolvedValueOnce(ANON_RATE_LIMIT - 1);
        expect(await isAnonymousRateLimited("abc", now)).toBe(false);
        expect(mockCount).toHaveBeenCalledWith(
            "anon:abc",
            "2026-10-23T11:50:00.000Z",
        );
        mockCount.mockResolvedValueOnce(ANON_RATE_LIMIT);
        expect(await isAnonymousRateLimited("abc", now)).toBe(true);
    });

    it("lets the download through if the count can't be read", async () => {
        mockCount.mockRejectedValueOnce(new Error("ddb down"));
        expect(await isAnonymousRateLimited("abc")).toBe(false);
    });
});
