/**
 * Device flow state management — DynamoDB-backed.
 *
 * Stores device codes in the DeviceCodes table with DynamoDB TTL
 * for automatic expiration. Uses a GSI on userCode for authorization lookups.
 */
import {
    DeleteCommand,
    GetCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "./db";

interface DeviceCodeEntry {
    deviceCode: string;
    userCode: string;
    expiresAt: number;
    interval: number;
    status: "pending" | "authorized" | "expired";
    token?: string;
    userId?: string;
    // Cognito refresh token (+ the client id it belongs to) forwarded from
    // the browser device-verification page so the desktop app can refresh
    // its short-lived access token directly against Cognito on expiry. These
    // live only for the lifetime of the device-code entry (≤15 min TTL,
    // deleted on successful poll) and are never persisted long-term server
    // side. Optional: an older client (or one whose Amplify storage didn't
    // surface the refresh token) simply omits them and the app falls back to
    // re-authenticating on expiry.
    refreshToken?: string;
    cognitoClientId?: string;
    ttl: number;
}

export interface DeviceAuthorizeExtras {
    refreshToken?: string;
    cognitoClientId?: string;
}

export async function createDeviceCode(
    deviceCode: string,
    userCode: string,
    expiresAt: number,
    interval: number,
): Promise<void> {
    await docClient.send(
        new PutCommand({
            TableName: TABLES.DEVICE_CODES,
            Item: {
                deviceCode,
                userCode,
                expiresAt,
                interval,
                status: "pending",
                ttl: Math.floor(expiresAt / 1000),
            },
        }),
    );
}

export async function getDeviceCode(
    deviceCode: string,
): Promise<DeviceCodeEntry | null> {
    const result = await docClient.send(
        new GetCommand({
            TableName: TABLES.DEVICE_CODES,
            Key: { deviceCode },
        }),
    );
    return (result.Item as DeviceCodeEntry) || null;
}

export async function deleteDeviceCode(deviceCode: string): Promise<void> {
    await docClient.send(
        new DeleteCommand({
            TableName: TABLES.DEVICE_CODES,
            Key: { deviceCode },
        }),
    );
}

export async function authorizeDeviceCode(
    userCode: string,
    token: string,
    userId: string,
    extras: DeviceAuthorizeExtras = {},
): Promise<boolean> {
    // Look up device code by userCode using GSI
    const result = await docClient.send(
        new QueryCommand({
            TableName: TABLES.DEVICE_CODES,
            IndexName: "userCode-index",
            KeyConditionExpression: "userCode = :uc",
            ExpressionAttributeValues: { ":uc": userCode },
        }),
    );

    const entry = result.Items?.find((item) => item.status === "pending");
    if (!entry) return false;

    // Build the SET clause. The refresh-token fields are only included when
    // the browser actually forwarded them — DynamoDB rejects undefined
    // attribute values, and an absent refresh token must leave the entry
    // valid (the app just won't be able to auto-refresh).
    const setParts = ["#s = :status", "#t = :token", "#u = :userId"];
    const names: Record<string, string> = {
        "#s": "status",
        "#t": "token",
        "#u": "userId",
    };
    const values: Record<string, unknown> = {
        ":status": "authorized",
        ":token": token,
        ":userId": userId,
        ":pending": "pending",
    };
    if (extras.refreshToken) {
        setParts.push("#rt = :rt");
        names["#rt"] = "refreshToken";
        values[":rt"] = extras.refreshToken;
    }
    if (extras.cognitoClientId) {
        setParts.push("#cid = :cid");
        names["#cid"] = "cognitoClientId";
        values[":cid"] = extras.cognitoClientId;
    }

    // Update the entry to authorized
    try {
        await docClient.send(
            new UpdateCommand({
                TableName: TABLES.DEVICE_CODES,
                Key: { deviceCode: entry.deviceCode },
                UpdateExpression: "SET " + setParts.join(", "),
                ConditionExpression: "#s = :pending",
                ExpressionAttributeNames: names,
                ExpressionAttributeValues: values,
            }),
        );
    } catch (err: unknown) {
        if (
            err instanceof Error &&
            err.name === "ConditionalCheckFailedException"
        ) {
            return false;
        }
        throw err;
    }

    return true;
}
