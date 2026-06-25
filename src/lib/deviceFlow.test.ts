/**
 * Unit tests for deviceFlow.ts — focused on the Cognito refresh-token
 * pass-through added to the device-code flow. The DynamoDB client is mocked
 * so the tests assert the UpdateCommand shape (which attributes get written)
 * rather than network behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("./db", async () => {
    const actual = await vi.importActual<typeof import("./db")>("./db");
    return {
        ...actual,
        docClient: { send: sendMock },
        TABLES: { ...actual.TABLES, DEVICE_CODES: "test-DeviceCodes" },
    };
});

import { authorizeDeviceCode } from "./deviceFlow";

beforeEach(() => {
    sendMock.mockReset();
});

function mockPendingThenUpdate() {
    // 1st send = Query (find pending entry), 2nd send = Update.
    sendMock
        .mockResolvedValueOnce({
            Items: [
                { deviceCode: "dc-1", userCode: "ABCD1234", status: "pending" },
            ],
        })
        .mockResolvedValueOnce({});
}

describe("authorizeDeviceCode — refresh-token pass-through", () => {
    it("writes refreshToken + cognitoClientId when provided", async () => {
        mockPendingThenUpdate();

        const ok = await authorizeDeviceCode("ABCD1234", "access-jwt", "user-1", {
            refreshToken: "cognito-refresh-xyz",
            cognitoClientId: "client-123",
        });
        expect(ok).toBe(true);

        const updateInput = sendMock.mock.calls[1][0].input;
        expect(updateInput.UpdateExpression).toContain("#rt = :rt");
        expect(updateInput.UpdateExpression).toContain("#cid = :cid");
        expect(updateInput.ExpressionAttributeNames["#rt"]).toBe("refreshToken");
        expect(updateInput.ExpressionAttributeNames["#cid"]).toBe(
            "cognitoClientId",
        );
        expect(updateInput.ExpressionAttributeValues[":rt"]).toBe(
            "cognito-refresh-xyz",
        );
        expect(updateInput.ExpressionAttributeValues[":cid"]).toBe("client-123");
        // The access token + status are still written as before.
        expect(updateInput.ExpressionAttributeValues[":token"]).toBe(
            "access-jwt",
        );
        expect(updateInput.ExpressionAttributeValues[":status"]).toBe(
            "authorized",
        );
    });

    it("omits refresh fields entirely when not provided (back-compat)", async () => {
        mockPendingThenUpdate();

        const ok = await authorizeDeviceCode("ABCD1234", "access-jwt", "user-1");
        expect(ok).toBe(true);

        const updateInput = sendMock.mock.calls[1][0].input;
        expect(updateInput.UpdateExpression).not.toContain(":rt");
        expect(updateInput.UpdateExpression).not.toContain(":cid");
        expect(updateInput.ExpressionAttributeValues).not.toHaveProperty(":rt");
        expect(updateInput.ExpressionAttributeValues).not.toHaveProperty(":cid");
        // Core fields unaffected.
        expect(updateInput.ExpressionAttributeValues[":token"]).toBe(
            "access-jwt",
        );
    });

    it("returns false when no pending entry matches the user code", async () => {
        sendMock.mockResolvedValueOnce({ Items: [] });
        const ok = await authorizeDeviceCode("NOPE", "access-jwt", "user-1", {
            refreshToken: "rt",
        });
        expect(ok).toBe(false);
        // Only the Query ran — no Update attempted.
        expect(sendMock).toHaveBeenCalledTimes(1);
    });
});
