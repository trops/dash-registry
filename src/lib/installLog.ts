/**
 * Install attempt logging.
 *
 * Records every install request — both granted and denied — for audit and
 * abuse detection. IP addresses are hashed (SHA-256 with a server-side
 * rotating salt) so we never store raw PII. TTL is 90 days (set via the
 * `expiresAt` attribute, enforced by DynamoDB).
 *
 * The salt is rotated by changing INSTALL_LOG_IP_SALT in env. Old hashes
 * stop matching new ones after rotation, which limits cross-period
 * linkability — a deliberate tradeoff for GDPR-friendliness.
 */
import crypto from "node:crypto";
import { putInstallLog, type InstallLogEntry } from "./db";

const TTL_DAYS = 90;

function getSalt(): string {
  return process.env.INSTALL_LOG_IP_SALT || "dev-salt-do-not-use-in-prod";
}

/**
 * Hash an IP address with the rotating server salt. Returns null if no IP.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip || ip === "unknown") return null;
  return crypto
    .createHash("sha256")
    .update(`${getSalt()}:${ip}`)
    .digest("hex");
}

/**
 * Extract the original client IP from x-forwarded-for, falling back to
 * x-real-ip. On Amplify/CloudFront, x-forwarded-for is the canonical source;
 * the leftmost entry is the original client.
 */
export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xRealIp = headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();
  return "unknown";
}

export interface LogInstallParams {
  userId: string;
  packageScope: string;
  packageName: string;
  version: string;
  result: InstallLogEntry["result"];
  entitlementId: string | null;
  ipHash: string | null;
  userAgent: string | null;
}

export async function logInstallAttempt(params: LogInstallParams) {
  const requestedAt = new Date().toISOString();
  const expiresAt =
    Math.floor(Date.now() / 1000) + TTL_DAYS * 24 * 60 * 60;
  const entry: InstallLogEntry = {
    userId: params.userId,
    sk: `${requestedAt}#${params.entitlementId || "public"}`,
    packageScope: params.packageScope,
    packageName: params.packageName,
    version: params.version,
    result: params.result,
    entitlementId: params.entitlementId,
    ipHash: params.ipHash,
    userAgent: params.userAgent,
    requestedAt,
    expiresAt,
  };
  // Best-effort: never let logging failure block an install response.
  try {
    await putInstallLog(entry);
  } catch (err) {
    console.error("[installLog] putInstallLog failed:", err);
  }
}
