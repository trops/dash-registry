/**
 * Unit tests for orgs.ts — slug validation, uniqueness, owner protection.
 * DB helpers are mocked so we can focus on the business rules.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
    putOrg: vi.fn(),
    getOrg: vi.fn(),
    getOrgBySlug: vi.fn(),
    putOrgMembership: vi.fn(),
    getOrgMembership: vi.fn(),
    deleteOrgMembership: vi.fn(),
    listOrgMembers: vi.fn(),
    listOrgsForUser: vi.fn(),
}));

import {
    createOrg,
    removeMember,
    isMember,
    isAdmin,
} from "./orgs";
import {
    putOrg,
    getOrgBySlug,
    putOrgMembership,
    getOrgMembership,
    deleteOrgMembership,
} from "./db";

const mockPutOrg = putOrg as unknown as ReturnType<typeof vi.fn>;
const mockGetOrgBySlug = getOrgBySlug as unknown as ReturnType<typeof vi.fn>;
const mockPutMembership = putOrgMembership as unknown as ReturnType<
    typeof vi.fn
>;
const mockGetMembership = getOrgMembership as unknown as ReturnType<
    typeof vi.fn
>;
const mockDeleteMembership = deleteOrgMembership as unknown as ReturnType<
    typeof vi.fn
>;

beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgBySlug.mockResolvedValue(null);
    mockGetMembership.mockResolvedValue(null);
});

describe("createOrg", () => {
    it("persists the org and makes the creator an owner", async () => {
        const org = await createOrg({
            slug: "acme",
            name: "Acme Corp",
            ownerUserId: "user-1",
        });
        expect(org.slug).toBe("acme");
        expect(org.ownerUserId).toBe("user-1");
        expect(mockPutOrg).toHaveBeenCalledOnce();
        expect(mockPutMembership).toHaveBeenCalledOnce();
        const call = mockPutMembership.mock.calls[0][0];
        expect(call.role).toBe("owner");
        expect(call.userId).toBe("user-1");
    });

    it("lowercases and trims the slug", async () => {
        const org = await createOrg({
            slug: "  ACME  ",
            name: "Acme",
            ownerUserId: "u",
        });
        expect(org.slug).toBe("acme");
    });

    it.each([
        ["ab", "too short"],
        ["A".repeat(50), "too long"],
        ["-leading", "leading hyphen"],
        ["trailing-", "trailing hyphen"],
        ["has spaces", "contains space"],
        ["weird!chars", "special chars"],
    ])("rejects invalid slug %s (%s)", async (slug) => {
        await expect(
            createOrg({ slug, name: "x", ownerUserId: "u" }),
        ).rejects.toThrow(/Invalid slug/);
    });

    it("auto-lowercases uppercase input rather than rejecting", async () => {
        const org = await createOrg({
            slug: "UPPERCASE",
            name: "x",
            ownerUserId: "u",
        });
        expect(org.slug).toBe("uppercase");
    });

    it("rejects a slug that's already taken", async () => {
        mockGetOrgBySlug.mockResolvedValue({
            orgId: "existing",
            slug: "acme",
            name: "existing",
            ownerUserId: "other",
            createdAt: "x",
        });
        await expect(
            createOrg({ slug: "acme", name: "Acme", ownerUserId: "u" }),
        ).rejects.toThrow(/taken/);
    });
});

describe("removeMember", () => {
    it("returns false if the member does not exist", async () => {
        mockGetMembership.mockResolvedValue(null);
        const result = await removeMember("org-1", "user-1");
        expect(result).toBe(false);
        expect(mockDeleteMembership).not.toHaveBeenCalled();
    });

    it("refuses to remove the owner", async () => {
        mockGetMembership.mockResolvedValue({
            orgId: "org-1",
            userId: "owner-1",
            role: "owner",
            joinedAt: "x",
        });
        await expect(removeMember("org-1", "owner-1")).rejects.toThrow(
            /Cannot remove the org owner/,
        );
        expect(mockDeleteMembership).not.toHaveBeenCalled();
    });

    it("removes a regular member", async () => {
        mockGetMembership.mockResolvedValue({
            orgId: "org-1",
            userId: "user-1",
            role: "member",
            joinedAt: "x",
        });
        const result = await removeMember("org-1", "user-1");
        expect(result).toBe(true);
        expect(mockDeleteMembership).toHaveBeenCalledWith("org-1", "user-1");
    });
});

describe("isMember / isAdmin", () => {
    it("isMember is true for any role", async () => {
        for (const role of ["owner", "admin", "member"] as const) {
            mockGetMembership.mockResolvedValue({
                orgId: "o",
                userId: "u",
                role,
                joinedAt: "x",
            });
            expect(await isMember("o", "u")).toBe(true);
        }
    });

    it("isMember is false for non-members", async () => {
        mockGetMembership.mockResolvedValue(null);
        expect(await isMember("o", "u")).toBe(false);
    });

    it("isAdmin is true for owner and admin, false for member", async () => {
        mockGetMembership.mockResolvedValue({
            orgId: "o",
            userId: "u",
            role: "owner",
            joinedAt: "x",
        });
        expect(await isAdmin("o", "u")).toBe(true);

        mockGetMembership.mockResolvedValue({
            orgId: "o",
            userId: "u",
            role: "admin",
            joinedAt: "x",
        });
        expect(await isAdmin("o", "u")).toBe(true);

        mockGetMembership.mockResolvedValue({
            orgId: "o",
            userId: "u",
            role: "member",
            joinedAt: "x",
        });
        expect(await isAdmin("o", "u")).toBe(false);
    });
});
