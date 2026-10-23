/**
 * The download route signed out (public packages only, logged under the
 * hashed IP with the app's install ID, rate-limited) and signed in
 * (unchanged). Storage, DB, signing and entitlement are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ authenticateRequest: vi.fn() }));
vi.mock("@/lib/db", () => ({
    getPackage: vi.fn(),
    getPackageVersion: vi.fn().mockResolvedValue(null),
    getUserByCognitoId: vi.fn().mockResolvedValue({ email: "a@b.c" }),
    putUserLibraryEntry: vi.fn(),
    putInstallLog: vi.fn(),
    countInstallLogSince: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/s3", () => ({
    getDownloadUrl: vi.fn().mockResolvedValue("https://s3/public.zip"),
    getPrivatePackageSignedUrl: vi.fn().mockResolvedValue("https://s3/p.zip"),
}));
vi.mock("@/lib/entitlement", () => ({
    checkEntitlement: vi
        .fn()
        .mockResolvedValue({ allowed: true, reason: "public", entitlementId: null }),
}));
vi.mock("@/lib/featureFlags", () => ({ isPrivatePackagesEnabled: () => true }));
vi.mock("@/lib/crypto", () => ({
    signManifestBody: vi.fn().mockResolvedValue("sig"),
    CURRENT_MANIFEST_SIGNATURE_KEYID: "k1",
}));
vi.mock("@/lib/registryRootKey", () => ({
    getRegistryRootKeys: vi.fn().mockResolvedValue({ privateKey: "pk" }),
}));

import { GET } from "./route";
import { authenticateRequest } from "@/lib/auth";
import {
    getPackage,
    putInstallLog,
    putUserLibraryEntry,
    countInstallLogSince,
} from "@/lib/db";
import { checkEntitlement } from "@/lib/entitlement";

const mocked = (f: unknown) => f as ReturnType<typeof vi.fn>;
const ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const params = { params: { scope: "trops", name: "clock" } };

function req(headers: Record<string, string> = {}) {
    return new NextRequest(
        "https://registry.test/api/packages/trops/clock/download",
        { headers: { "x-forwarded-for": "203.0.113.7", ...headers } },
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mocked(authenticateRequest).mockResolvedValue(null);
    mocked(countInstallLogSince).mockResolvedValue(0);
    mocked(getPackage).mockResolvedValue({
        scope: "trops",
        name: "clock",
        latestVersion: "1.0.0",
        visibility: "public",
    });
});

describe("signed out", () => {
    it("downloads a public package, logged under the IP with the install ID", async () => {
        const res = await GET(req({ "x-dash-install-id": ID }), params);
        expect(res.status).toBe(200);
        expect((await res.json()).downloadUrl).toBe("https://s3/public.zip");
        const entry = mocked(putInstallLog).mock.calls[0][0];
        expect(entry.userId).toMatch(/^anon:[0-9a-f]{64}$/);
        expect(entry).toMatchObject({ installId: ID, result: "granted_public" });
        expect(putUserLibraryEntry).not.toHaveBeenCalled();
        expect(checkEntitlement).not.toHaveBeenCalled();
    });

    it("a package with no visibility set counts as public", async () => {
        mocked(getPackage).mockResolvedValue({
            scope: "trops",
            name: "clock",
            latestVersion: "1.0.0",
        });
        expect((await GET(req(), params)).status).toBe(200);
    });

    it("a private or missing package answers 401 (sign in), revealing nothing", async () => {
        mocked(getPackage).mockResolvedValue({
            scope: "trops",
            name: "clock",
            latestVersion: "1.0.0",
            visibility: "private",
        });
        expect((await GET(req(), params)).status).toBe(401);
        mocked(getPackage).mockResolvedValue(null);
        expect((await GET(req(), params)).status).toBe(401);
        expect(putInstallLog).not.toHaveBeenCalled();
    });

    it("too many downloads from one IP answers 429", async () => {
        mocked(countInstallLogSince).mockResolvedValue(120);
        const res = await GET(req(), params);
        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).toBe("600");
        expect(mocked(countInstallLogSince).mock.calls[0][0]).toMatch(
            /^anon:[0-9a-f]{64}$/,
        );
        expect(putInstallLog).not.toHaveBeenCalled();
    });

    it("a spoofed leading x-forwarded-for doesn't change whose limit it counts", async () => {
        await GET(req(), params);
        await GET(req({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }), params);
        const keys = mocked(countInstallLogSince).mock.calls.map((c) => c[0]);
        expect(keys[0]).toBe(keys[1]);
    });

    it("a bad install ID isn't stored", async () => {
        await GET(req({ "x-dash-install-id": "<script>" }), params);
        expect(mocked(putInstallLog).mock.calls[0][0].installId).toBeNull();
    });
});

describe("with a token", () => {
    it("signed in: a missing package is still 404", async () => {
        mocked(authenticateRequest).mockResolvedValue({ sub: "user-1" });
        mocked(getPackage).mockResolvedValue(null);
        const res = await GET(req({ Authorization: "Bearer good" }), params);
        expect(res.status).toBe(404);
    });

    it("signed in: a private package you aren't entitled to is 404, logged as denied", async () => {
        mocked(authenticateRequest).mockResolvedValue({ sub: "user-1" });
        mocked(checkEntitlement).mockResolvedValueOnce({
            allowed: false,
            reason: "no_entitlement",
            entitlementId: null,
        });
        const res = await GET(req({ Authorization: "Bearer good" }), params);
        expect(res.status).toBe(404);
        expect(mocked(putInstallLog).mock.calls[0][0]).toMatchObject({
            userId: "user-1",
            result: "denied_no_entitlement",
        });
    });

    it("a token that doesn't verify still answers 401 (sign in again)", async () => {
        const res = await GET(req({ Authorization: "Bearer expired" }), params);
        expect(res.status).toBe(401);
        expect(getPackage).not.toHaveBeenCalled();
    });

    it("signed in: entitlement, library and the user's log, no rate limit", async () => {
        mocked(authenticateRequest).mockResolvedValue({ sub: "user-1" });
        mocked(countInstallLogSince).mockResolvedValue(1000);
        const res = await GET(
            req({ Authorization: "Bearer good", "x-dash-install-id": ID }),
            params,
        );
        expect(res.status).toBe(200);
        expect(checkEntitlement).toHaveBeenCalled();
        expect(putUserLibraryEntry).toHaveBeenCalledWith(
            expect.objectContaining({ userId: "user-1" }),
        );
        expect(mocked(putInstallLog).mock.calls[0][0]).toMatchObject({
            userId: "user-1",
            installId: ID,
        });
    });
});
