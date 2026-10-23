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
import {
  countInstallLogSince,
  putInstallLog,
  type InstallLogEntry,
} from "./db";

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

// Private, loopback and link-local addresses: proxies inside the hosting,
// never the viewer.
const INTERNAL_IP =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;

/**
 * The client's IP. CloudFront appends the viewer's address to
 * x-forwarded-for, after anything the client sent itself, so the rightmost
 * public entry is the one to trust (the leftmost is whatever the client typed
 * — it keys the signed-out rate limit, so it mustn't be spoofable). Falls
 * back to x-real-ip.
 */
export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const entries = xff
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    for (let i = entries.length - 1; i >= 0; i--) {
      if (!INTERNAL_IP.test(entries[i])) return entries[i];
    }
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
  installId?: string | null;
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
    installId: params.installId ?? null,
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

// --- Anonymous downloads (public packages without sign-in) ---

/** The header the Dash app sends its anonymous install ID in. */
export const INSTALL_ID_HEADER = "x-dash-install-id";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The install ID if it's a UUID, else null (never store arbitrary text). */
export function parseInstallId(value: string | null | undefined) {
  const v = (value || "").trim();
  return UUID.test(v) ? v.toLowerCase() : null;
}

/**
 * The log key for a signed-out download: one partition per hashed IP, so a
 * per-IP count is one Query.
 */
export function anonymousLogKey(ipHash: string | null) {
  return `anon:${ipHash || "unknown"}`;
}

// A dashboard installs its widgets one download each, so this is generous.
export const ANON_RATE_LIMIT = 120;
export const ANON_RATE_WINDOW_SECONDS = 10 * 60;

/**
 * Whether this IP has made too many signed-out downloads lately. Counts its
 * own log entries; if the count can't be read, it lets the download through.
 */
export async function isAnonymousRateLimited(
  ipHash: string | null,
  now = Date.now(),
) {
  const since = new Date(now - ANON_RATE_WINDOW_SECONDS * 1000).toISOString();
  try {
    const count = await countInstallLogSince(anonymousLogKey(ipHash), since);
    return count >= ANON_RATE_LIMIT;
  } catch (err) {
    console.error("[installLog] rate-limit count failed:", err);
    return false;
  }
}
