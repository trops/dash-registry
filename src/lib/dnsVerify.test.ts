/**
 * Unit tests for the DNS verification helper.
 *
 * verifyDomainTxt is tested with a mocked dns.resolveTxt so the tests
 * don't depend on network or a real DNS record. The helpers that do
 * pure string-manipulation (generateVerificationToken, isPlausibleDomain)
 * are tested directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Must mock BEFORE importing the module under test.
vi.mock("node:dns/promises", () => ({
    default: { resolveTxt: vi.fn() },
    resolveTxt: vi.fn(),
}));

import dns from "node:dns/promises";
import {
    generateVerificationToken,
    isPlausibleDomain,
    verifyDomainTxt,
} from "./dnsVerify";

const mockResolveTxt = dns.resolveTxt as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("generateVerificationToken", () => {
    it("produces dash-verify-<hex> with 96 bits of entropy", () => {
        const t = generateVerificationToken();
        expect(t).toMatch(/^dash-verify-[0-9a-f]{24}$/);
    });

    it("produces different tokens on successive calls", () => {
        const a = generateVerificationToken();
        const b = generateVerificationToken();
        expect(a).not.toBe(b);
    });
});

describe("isPlausibleDomain", () => {
    it.each([
        "algolia.com",
        "sub.algolia.com",
        "xn--80ak6aa92e.com", // IDN encoded
        "a-b.c-d.example",
    ])("accepts valid bare domain %s", (d) => {
        expect(isPlausibleDomain(d)).toBe(true);
    });

    it.each([
        ["", "empty"],
        ["https://algolia.com", "has scheme"],
        ["algolia.com/path", "has path"],
        ["user@algolia.com", "has @"],
        ["algolia com", "has space"],
        ["no-tld", "no dot"],
        ["-leading.com", "leading hyphen"],
    ])("rejects %s (%s)", (d) => {
        expect(isPlausibleDomain(d)).toBe(false);
    });

    it("normalizes case (accepts uppercase by lowercasing)", () => {
        expect(isPlausibleDomain("Algolia.COM")).toBe(true);
    });
});

describe("verifyDomainTxt", () => {
    it("returns verified=true when a TXT record matches the token", async () => {
        mockResolveTxt.mockResolvedValueOnce([
            ["unrelated-record"],
            ["dash-verify-abc123"],
        ]);
        const result = await verifyDomainTxt(
            "algolia.com",
            "dash-verify-abc123",
        );
        expect(result.verified).toBe(true);
        expect(result.foundValues).toContain("dash-verify-abc123");
        expect(mockResolveTxt).toHaveBeenCalledWith(
            "_dash-verify.algolia.com",
        );
    });

    it("joins multi-part TXT records before comparing", async () => {
        // Real TXT records can be split into multiple strings; the helper
        // must concatenate them.
        mockResolveTxt.mockResolvedValueOnce([
            ["dash-verify-", "abc123"],
        ]);
        const result = await verifyDomainTxt(
            "algolia.com",
            "dash-verify-abc123",
        );
        expect(result.verified).toBe(true);
    });

    it("returns verified=false when no TXT record contains the token", async () => {
        mockResolveTxt.mockResolvedValueOnce([["some-other-value"]]);
        const result = await verifyDomainTxt(
            "algolia.com",
            "dash-verify-abc123",
        );
        expect(result.verified).toBe(false);
        expect(result.foundValues).toEqual(["some-other-value"]);
    });

    it("returns verified=false on NXDOMAIN / ENOTFOUND", async () => {
        const err = new Error("not found") as NodeJS.ErrnoException;
        err.code = "ENOTFOUND";
        mockResolveTxt.mockRejectedValueOnce(err);
        const result = await verifyDomainTxt(
            "nope.invalid",
            "dash-verify-abc123",
        );
        expect(result).toEqual({ verified: false, foundValues: [] });
    });

    it("propagates unexpected resolver errors", async () => {
        mockResolveTxt.mockRejectedValueOnce(new Error("resolver exploded"));
        await expect(
            verifyDomainTxt("algolia.com", "dash-verify-abc123"),
        ).rejects.toThrow(/resolver exploded/);
    });

    it("lowercases the domain before lookup", async () => {
        mockResolveTxt.mockResolvedValueOnce([["dash-verify-abc123"]]);
        await verifyDomainTxt("ALGOLIA.COM", "dash-verify-abc123");
        expect(mockResolveTxt).toHaveBeenCalledWith(
            "_dash-verify.algolia.com",
        );
    });
});
