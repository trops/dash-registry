/**
 * Unit tests for publisherKeys.ts — the DB layer for publisher signing
 * keys. The DynamoDB client is mocked so the tests cover the command
 * shapes (TableName, Key, IndexName) rather than network behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist the mock send fn so vi.mock's factory (also hoisted) can see it.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("./db", async () => {
    const actual = await vi.importActual<typeof import("./db")>("./db");
    return {
        ...actual,
        docClient: { send: sendMock },
        TABLES: { ...actual.TABLES, PUBLISHER_KEYS: "test-PublisherKeys" },
    };
});

import {
    putPublisherKey,
    getPublisherKey,
    getPublisherKeyByFingerprint,
    listPublisherKeys,
    revokePublisherKey,
    deletePublisherKey,
    type PublisherKey,
} from "./publisherKeys";

function fixture(overrides: Partial<PublisherKey> = {}): PublisherKey {
    return {
        publisherId: "user-abc",
        keyId: "key-001",
        publicKey: "pk-base64",
        fingerprint: "deadbeef".repeat(8),
        machineLabel: "test-laptop",
        createdAt: "2026-05-25T00:00:00Z",
        cert: {
            body: {
                v: 1,
                publisher_id: "user-abc",
                public_key: "pk-base64",
                fingerprint: "deadbeef".repeat(8),
                issued_at: "2026-05-25T00:00:00Z",
                expires_at: "2028-05-25T00:00:00Z",
            },
            sig: "sig-base64",
        },
        ...overrides,
    };
}

beforeEach(() => {
    sendMock.mockReset();
});

describe("putPublisherKey", () => {
    it("writes to the PublisherKeys table", async () => {
        sendMock.mockResolvedValueOnce({});
        await putPublisherKey(fixture());
        const cmd = sendMock.mock.calls[0][0];
        expect(cmd.input.TableName).toBe("test-PublisherKeys");
        expect(cmd.input.Item.publisherId).toBe("user-abc");
        expect(cmd.input.Item.keyId).toBe("key-001");
    });
});

describe("getPublisherKey", () => {
    it("fetches by composite key", async () => {
        const row = fixture();
        sendMock.mockResolvedValueOnce({ Item: row });
        const result = await getPublisherKey("user-abc", "key-001");
        expect(result).toEqual(row);
        const cmd = sendMock.mock.calls[0][0];
        expect(cmd.input.Key).toEqual({
            publisherId: "user-abc",
            keyId: "key-001",
        });
    });

    it("returns null when the row does not exist", async () => {
        sendMock.mockResolvedValueOnce({});
        const result = await getPublisherKey("user-abc", "missing");
        expect(result).toBeNull();
    });
});

describe("getPublisherKeyByFingerprint", () => {
    it("queries the ByFingerprint GSI", async () => {
        const row = fixture();
        sendMock.mockResolvedValueOnce({ Items: [row] });
        const result = await getPublisherKeyByFingerprint(row.fingerprint);
        expect(result).toEqual(row);
        const cmd = sendMock.mock.calls[0][0];
        expect(cmd.input.IndexName).toBe("ByFingerprint");
        expect(cmd.input.KeyConditionExpression).toContain("fingerprint");
    });

    it("returns null when no rows match", async () => {
        sendMock.mockResolvedValueOnce({ Items: [] });
        const result = await getPublisherKeyByFingerprint("nope");
        expect(result).toBeNull();
    });
});

describe("listPublisherKeys", () => {
    it("queries by partition key", async () => {
        const rows = [fixture(), fixture({ keyId: "key-002" })];
        sendMock.mockResolvedValueOnce({ Items: rows });
        const result = await listPublisherKeys("user-abc");
        expect(result).toHaveLength(2);
        const cmd = sendMock.mock.calls[0][0];
        expect(cmd.input.KeyConditionExpression).toBe("publisherId = :p");
    });
});

describe("revokePublisherKey", () => {
    it("sets revokedAt and returns the updated row", async () => {
        const row = fixture({ revokedAt: "2026-06-01T00:00:00Z" });
        sendMock.mockResolvedValueOnce({ Attributes: row });
        const result = await revokePublisherKey(
            "user-abc",
            "key-001",
            "2026-06-01T00:00:00Z",
        );
        expect(result?.revokedAt).toBe("2026-06-01T00:00:00Z");
        const cmd = sendMock.mock.calls[0][0];
        expect(cmd.input.UpdateExpression).toContain("revokedAt");
        expect(cmd.input.ConditionExpression).toContain("attribute_exists");
    });
});

describe("deletePublisherKey", () => {
    it("issues a Delete command", async () => {
        sendMock.mockResolvedValueOnce({});
        await deletePublisherKey("user-abc", "key-001");
        const cmd = sendMock.mock.calls[0][0];
        expect(cmd.input.TableName).toBe("test-PublisherKeys");
    });
});
