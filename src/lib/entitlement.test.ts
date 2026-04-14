/**
 * Unit tests for entitlement.ts — the gate used by every install/read route.
 *
 * DB helpers and the feature-flag module are mocked so the tests cover the
 * decision logic in isolation. The feature flag is flipped ON by default for
 * every test via beforeEach; flag-off behavior has a dedicated case.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (must be set up before importing the module under test) ---

vi.mock("./db", () => ({
    listEntitlementsForPackage: vi.fn(),
    listOrgsForUser: vi.fn(),
    listOrgsForDomain: vi.fn(),
    claimEntitlementSeat: vi.fn(),
}));

vi.mock("./featureFlags", () => ({
    isPrivatePackagesEnabled: vi.fn(() => true),
}));

import {
    checkEntitlement,
    filterReadableByUser,
    buildEntitlement,
} from "./entitlement";
import {
    listEntitlementsForPackage,
    listOrgsForUser,
    listOrgsForDomain,
    claimEntitlementSeat,
    type Entitlement,
} from "./db";
import { isPrivatePackagesEnabled } from "./featureFlags";

const mockList = listEntitlementsForPackage as unknown as ReturnType<
    typeof vi.fn
>;
const mockOrgs = listOrgsForUser as unknown as ReturnType<typeof vi.fn>;
const mockDomainOrgs = listOrgsForDomain as unknown as ReturnType<typeof vi.fn>;
const mockClaim = claimEntitlementSeat as unknown as ReturnType<typeof vi.fn>;
const mockFlag = isPrivatePackagesEnabled as unknown as ReturnType<
    typeof vi.fn
>;

// --- Fixtures ---

function entitlement(overrides: Partial<Entitlement> = {}): Entitlement {
    return {
        entitlementId: "ent_test",
        packageScope: "acme",
        packageName: "widget",
        packageKey: "acme#widget",
        versionConstraint: "*",
        granteeType: "user",
        granteeId: "user-123",
        granteeKey: "user#user-123",
        seats: null,
        activeSeats: 0,
        expiresAt: null,
        source: "manual",
        createdByUserId: "owner-1",
        createdAt: "2026-01-01T00:00:00Z",
        claimedByUserId: null,
        claimedAt: null,
        revokedAt: null,
        ...overrides,
    };
}

function pkg(overrides: Record<string, unknown> = {}) {
    return {
        scope: "acme",
        name: "widget",
        visibility: "private",
        ownerId: "owner-1",
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockFlag.mockReturnValue(true);
    mockOrgs.mockResolvedValue([]);
    mockDomainOrgs.mockResolvedValue([]);
    mockList.mockResolvedValue([]);
    mockClaim.mockResolvedValue(true);
});

// --- checkEntitlement ---

describe("checkEntitlement", () => {
    it("allows public packages without consulting DB", async () => {
        const result = await checkEntitlement({
            userId: "anyone",
            pkg: pkg({ visibility: "public" }),
            version: "1.0.0",
        });
        expect(result).toEqual({
            allowed: true,
            reason: "public",
            entitlementId: null,
        });
        expect(mockList).not.toHaveBeenCalled();
    });

    it("allows the package owner without needing an entitlement", async () => {
        const result = await checkEntitlement({
            userId: "owner-1",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result).toEqual({
            allowed: true,
            reason: "owner",
            entitlementId: null,
        });
        expect(mockList).not.toHaveBeenCalled();
    });

    it("allows a user with a direct user-grant entitlement", async () => {
        mockList.mockResolvedValue([entitlement()]);
        const result = await checkEntitlement({
            userId: "user-123",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result).toEqual({
            allowed: true,
            reason: "entitled",
            entitlementId: "ent_test",
        });
    });

    it("allows a user whose org holds the entitlement", async () => {
        mockOrgs.mockResolvedValue([
            { orgId: "org-42", userId: "user-x", role: "member", joinedAt: "x" },
        ]);
        mockList.mockResolvedValue([
            entitlement({
                granteeType: "org",
                granteeId: "org-42",
                granteeKey: "org#org-42",
            }),
        ]);
        const result = await checkEntitlement({
            userId: "user-x",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result.allowed).toBe(true);
        if (result.allowed) expect(result.reason).toBe("entitled");
    });

    it("denies when no entitlement matches the user or their orgs", async () => {
        mockList.mockResolvedValue([
            entitlement({
                granteeId: "someone-else",
                granteeKey: "user#someone-else",
            }),
        ]);
        const result = await checkEntitlement({
            userId: "user-123",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result).toEqual({
            allowed: false,
            reason: "no_entitlement",
            entitlementId: null,
        });
    });

    it("skips revoked entitlements", async () => {
        mockList.mockResolvedValue([
            entitlement({ revokedAt: "2026-02-01T00:00:00Z" }),
        ]);
        const result = await checkEntitlement({
            userId: "user-123",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result.allowed).toBe(false);
    });

    it("reports expired when the only matching entitlement has expired", async () => {
        mockList.mockResolvedValue([
            entitlement({ expiresAt: "2020-01-01T00:00:00Z" }),
        ]);
        const result = await checkEntitlement({
            userId: "user-123",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result).toEqual({
            allowed: false,
            reason: "expired",
            entitlementId: null,
        });
    });

    it("reports seats_exhausted when the seat claim fails", async () => {
        mockList.mockResolvedValue([entitlement({ seats: 5, activeSeats: 5 })]);
        mockClaim.mockResolvedValue(false);
        const result = await checkEntitlement({
            userId: "user-123",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result).toEqual({
            allowed: false,
            reason: "seats_exhausted",
            entitlementId: null,
        });
        expect(mockClaim).toHaveBeenCalledWith("ent_test");
    });

    it("claims a seat only when seats is bounded", async () => {
        mockList.mockResolvedValue([entitlement({ seats: null })]);
        const result = await checkEntitlement({
            userId: "user-123",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result.allowed).toBe(true);
        expect(mockClaim).not.toHaveBeenCalled();
    });

    it("allows a user whose verified email matches an email-pending grant", async () => {
        mockList.mockResolvedValue([
            entitlement({
                granteeType: "email",
                granteeId: "alice@example.com",
                granteeKey: "email#alice@example.com",
            }),
        ]);
        const result = await checkEntitlement({
            userId: "user-123",
            verifiedEmail: "alice@example.com",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result.allowed).toBe(true);
        if (result.allowed) expect(result.reason).toBe("entitled");
    });

    it("normalizes email casing when matching pending grants", async () => {
        mockList.mockResolvedValue([
            entitlement({
                granteeType: "email",
                granteeId: "alice@example.com",
                granteeKey: "email#alice@example.com",
            }),
        ]);
        const result = await checkEntitlement({
            userId: "user-123",
            verifiedEmail: "  Alice@Example.COM  ",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result.allowed).toBe(true);
    });

    it("ignores email-pending grants when no verified email is provided", async () => {
        mockList.mockResolvedValue([
            entitlement({
                granteeType: "email",
                granteeId: "alice@example.com",
                granteeKey: "email#alice@example.com",
            }),
        ]);
        const result = await checkEntitlement({
            userId: "user-123",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result.allowed).toBe(false);
    });

    it("allows a user whose verified-email domain matches a verified org domain", async () => {
        // Domain org owns a grant, user is NOT an explicit member, but
        // their email is @algolia.com which is verified for that org.
        mockDomainOrgs.mockResolvedValue([
            {
                orgId: "org-domain",
                domain: "algolia.com",
                verificationToken: "t",
                verifiedAt: "2026-01-01T00:00:00Z",
                createdByUserId: "x",
                createdAt: "2026-01-01T00:00:00Z",
            },
        ]);
        mockList.mockResolvedValue([
            entitlement({
                granteeType: "org",
                granteeId: "org-domain",
                granteeKey: "org#org-domain",
            }),
        ]);
        const result = await checkEntitlement({
            userId: "user-xyz",
            verifiedEmail: "anyone@algolia.com",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result.allowed).toBe(true);
        if (result.allowed) expect(result.reason).toBe("entitled");
    });

    it("ignores UNVERIFIED domain claims (verifiedAt null)", async () => {
        mockDomainOrgs.mockResolvedValue([
            {
                orgId: "org-pending",
                domain: "algolia.com",
                verificationToken: "t",
                verifiedAt: null, // not verified yet
                createdByUserId: "x",
                createdAt: "2026-01-01T00:00:00Z",
            },
        ]);
        mockList.mockResolvedValue([
            entitlement({
                granteeType: "org",
                granteeId: "org-pending",
                granteeKey: "org#org-pending",
            }),
        ]);
        const result = await checkEntitlement({
            userId: "user-xyz",
            verifiedEmail: "anyone@algolia.com",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result.allowed).toBe(false);
    });

    it("ignores domain-verified access when no verified email is supplied", async () => {
        mockDomainOrgs.mockResolvedValue([
            {
                orgId: "org-domain",
                domain: "algolia.com",
                verificationToken: "t",
                verifiedAt: "2026-01-01T00:00:00Z",
                createdByUserId: "x",
                createdAt: "2026-01-01T00:00:00Z",
            },
        ]);
        mockList.mockResolvedValue([
            entitlement({
                granteeType: "org",
                granteeId: "org-domain",
                granteeKey: "org#org-domain",
            }),
        ]);
        const result = await checkEntitlement({
            userId: "user-xyz",
            pkg: pkg(),
            version: "1.0.0",
        });
        expect(result.allowed).toBe(false);
    });

    it("bypasses the entire check when the feature flag is off", async () => {
        mockFlag.mockReturnValue(false);
        const result = await checkEntitlement({
            userId: "nobody",
            pkg: pkg({ visibility: "private" }),
            version: "1.0.0",
        });
        expect(result).toEqual({
            allowed: true,
            reason: "public",
            entitlementId: null,
        });
        expect(mockList).not.toHaveBeenCalled();
    });
});

// --- filterReadableByUser ---

describe("filterReadableByUser", () => {
    it("returns all packages unchanged when the flag is off", async () => {
        mockFlag.mockReturnValue(false);
        const input = [pkg({ visibility: "private" }), pkg({ visibility: "public" })];
        const out = await filterReadableByUser(input, "user-x");
        expect(out).toHaveLength(2);
    });

    it("passes through public packages and excludes private without entitlement", async () => {
        const input = [
            pkg({ scope: "a", name: "pub", visibility: "public" }),
            pkg({ scope: "b", name: "priv", visibility: "private" }),
        ];
        mockList.mockResolvedValue([]); // no entitlements for the private one
        const out = await filterReadableByUser(input, "user-x");
        expect(out.map((p) => p.name)).toEqual(["pub"]);
    });

    it("includes private packages owned by the caller", async () => {
        const input = [pkg({ visibility: "private", ownerId: "me" })];
        const out = await filterReadableByUser(input, "me");
        expect(out).toHaveLength(1);
    });

    it("excludes private packages for anonymous callers", async () => {
        const input = [pkg({ visibility: "private" })];
        const out = await filterReadableByUser(input, null);
        expect(out).toEqual([]);
    });

    it("does NOT claim seats during visibility checks", async () => {
        const input = [pkg({ visibility: "private" })];
        mockList.mockResolvedValue([entitlement({ seats: 1, activeSeats: 1 })]);
        await filterReadableByUser(input, "user-123");
        expect(mockClaim).not.toHaveBeenCalled();
    });
});

// --- buildEntitlement ---

describe("buildEntitlement", () => {
    it("produces a well-formed entitlement with sensible defaults", () => {
        const e = buildEntitlement({
            packageScope: "acme",
            packageName: "widget",
            granteeType: "user",
            granteeId: "u-1",
            source: "manual",
            createdByUserId: "owner-1",
        });
        expect(e.packageKey).toBe("acme#widget");
        expect(e.granteeKey).toBe("user#u-1");
        expect(e.versionConstraint).toBe("*");
        expect(e.seats).toBeNull();
        expect(e.activeSeats).toBe(0);
        expect(e.expiresAt).toBeNull();
        expect(e.revokedAt).toBeNull();
        expect(e.claimedByUserId).toBeNull();
        expect(e.claimedAt).toBeNull();
        expect(e.entitlementId).toMatch(/^ent_/);
    });

    it("normalizes email grantees to lowercase + trimmed", () => {
        const e = buildEntitlement({
            packageScope: "acme",
            packageName: "widget",
            granteeType: "email",
            granteeId: "  Alice@Example.COM ",
            source: "invite",
            createdByUserId: "owner-1",
        });
        expect(e.granteeType).toBe("email");
        expect(e.granteeId).toBe("alice@example.com");
        expect(e.granteeKey).toBe("email#alice@example.com");
    });

    it("preserves provided seats and expiresAt", () => {
        const e = buildEntitlement({
            packageScope: "acme",
            packageName: "widget",
            granteeType: "org",
            granteeId: "o-1",
            seats: 10,
            expiresAt: "2027-01-01T00:00:00Z",
            source: "purchase",
            createdByUserId: "owner-1",
        });
        expect(e.seats).toBe(10);
        expect(e.expiresAt).toBe("2027-01-01T00:00:00Z");
        expect(e.granteeKey).toBe("org#o-1");
    });
});
