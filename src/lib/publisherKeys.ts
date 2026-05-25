/**
 * Publisher signing-key registry.
 *
 * One row per (publisher, machine). Each row is the public half of an
 * Ed25519 keypair that lives on the publisher's machine. The registry
 * signs the public key (issuing a PublisherCert) when it's first
 * registered, then this table is the authoritative store of which keys
 * are valid and which are revoked.
 *
 * Schema:
 *   {
 *     publisherId:    "<cognito sub>",        // partition key
 *     keyId:          "<uuid>",                // sort key
 *     publicKey:      "<base64 Ed25519>",
 *     fingerprint:    "<hex sha256(public_key)>",  // GSI: ByFingerprint
 *     machineLabel:   "MacBook-Pro" | string,
 *     createdAt:      "<ISO8601>",
 *     revokedAt:      "<ISO8601>" | undefined,
 *     // Embedded copy of the signed cert as issued — handy for
 *     // re-serving it without re-signing on every download fetch.
 *     cert:           { body, sig },
 *   }
 */
import {
    DeleteCommand,
    GetCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "./db";
import type { PublisherCert } from "./crypto";

export interface PublisherKey {
    publisherId: string;
    keyId: string;
    publicKey: string;
    fingerprint: string;
    machineLabel: string;
    createdAt: string;
    revokedAt?: string;
    cert: PublisherCert;
}

export async function putPublisherKey(row: PublisherKey): Promise<void> {
    await docClient.send(
        new PutCommand({
            TableName: TABLES.PUBLISHER_KEYS,
            Item: row,
        }),
    );
}

export async function getPublisherKey(
    publisherId: string,
    keyId: string,
): Promise<PublisherKey | null> {
    const result = await docClient.send(
        new GetCommand({
            TableName: TABLES.PUBLISHER_KEYS,
            Key: { publisherId, keyId },
        }),
    );
    return (result.Item as PublisherKey | undefined) ?? null;
}

/**
 * Revocation-status lookup at install time. The installer hands the
 * registry a fingerprint and asks "is this revoked?". GSI lookup keeps
 * this cheap regardless of how many publishers exist.
 */
export async function getPublisherKeyByFingerprint(
    fingerprint: string,
): Promise<PublisherKey | null> {
    const result = await docClient.send(
        new QueryCommand({
            TableName: TABLES.PUBLISHER_KEYS,
            IndexName: "ByFingerprint",
            KeyConditionExpression: "fingerprint = :fp",
            ExpressionAttributeValues: { ":fp": fingerprint },
            Limit: 1,
        }),
    );
    const item = result.Items?.[0];
    return (item as PublisherKey | undefined) ?? null;
}

export async function listPublisherKeys(
    publisherId: string,
): Promise<PublisherKey[]> {
    const result = await docClient.send(
        new QueryCommand({
            TableName: TABLES.PUBLISHER_KEYS,
            KeyConditionExpression: "publisherId = :p",
            ExpressionAttributeValues: { ":p": publisherId },
        }),
    );
    return (result.Items as PublisherKey[] | undefined) ?? [];
}

export async function revokePublisherKey(
    publisherId: string,
    keyId: string,
    revokedAt: string = new Date().toISOString(),
): Promise<PublisherKey | null> {
    const result = await docClient.send(
        new UpdateCommand({
            TableName: TABLES.PUBLISHER_KEYS,
            Key: { publisherId, keyId },
            UpdateExpression: "SET revokedAt = :r",
            ConditionExpression: "attribute_exists(publisherId)",
            ExpressionAttributeValues: { ":r": revokedAt },
            ReturnValues: "ALL_NEW",
        }),
    );
    return (result.Attributes as PublisherKey | undefined) ?? null;
}

/**
 * Delete a key entirely. Reserved for administrative cleanup; the
 * normal user-facing operation is `revokePublisherKey`, which preserves
 * audit history.
 */
export async function deletePublisherKey(
    publisherId: string,
    keyId: string,
): Promise<void> {
    await docClient.send(
        new DeleteCommand({
            TableName: TABLES.PUBLISHER_KEYS,
            Key: { publisherId, keyId },
        }),
    );
}
