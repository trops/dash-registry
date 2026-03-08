/**
 * Device flow state management.
 *
 * Shared between the device API route and the device verification page.
 * In production, this should be backed by DynamoDB with TTL.
 */

interface DeviceCodeEntry {
    userCode: string;
    expiresAt: number;
    interval: number;
    status: "pending" | "authorized" | "expired";
    token?: string;
    userId?: string;
}

export const deviceCodes = new Map<string, DeviceCodeEntry>();

export function cleanupExpired() {
    const now = Date.now();
    const keys = Array.from(deviceCodes.keys());
    for (const key of keys) {
        const value = deviceCodes.get(key);
        if (value && now > value.expiresAt) {
            deviceCodes.delete(key);
        }
    }
}

export function authorizeDeviceCode(
    userCode: string,
    token: string,
    userId: string,
): boolean {
    const entries = Array.from(deviceCodes.values());
    for (const entry of entries) {
        if (entry.userCode === userCode && entry.status === "pending") {
            entry.status = "authorized";
            entry.token = token;
            entry.userId = userId;
            return true;
        }
    }
    return false;
}
