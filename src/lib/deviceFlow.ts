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
    ttl: number;
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

    // Update the entry to authorized
    await docClient.send(
        new UpdateCommand({
            TableName: TABLES.DEVICE_CODES,
            Key: { deviceCode: entry.deviceCode },
            UpdateExpression:
                "SET #s = :status, #t = :token, #u = :userId",
            ConditionExpression: "#s = :pending",
            ExpressionAttributeNames: {
                "#s": "status",
                "#t": "token",
                "#u": "userId",
            },
            ExpressionAttributeValues: {
                ":status": "authorized",
                ":token": token,
                ":userId": userId,
                ":pending": "pending",
            },
        }),
    );

    return true;
}
