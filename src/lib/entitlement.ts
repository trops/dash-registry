/**
 * Entitlement check — the single gate every install/read route consults
 * before issuing a private package.
 *
 * Decision order:
 *   1. Public packages              → granted_public  (no entitlement needed)
 *   2. Requester is the owner       → granted_owner   (publishers always get their own work)
 *   3. Find any non-revoked, non-expired entitlement covering the package
 *      where granteeKey matches the user OR one of their orgs.
 *   4. If the entitlement has bounded seats: try to claim a seat atomically.
 *      A failure here yields denied_seats_exhausted.
 *   5. Otherwise → denied_no_entitlement.
 *
 * Version constraints: Phase 1 supports "*" only (any version). The schema
 * carries a versionConstraint field so we can layer in semver matching later
 * without a migration.
 */
import {
  listEntitlementsForPackage,
  listOrgsForUser,
  claimEntitlementSeat,
  type Entitlement,
} from "./db";
import { isPrivatePackagesEnabled } from "./featureFlags";

export type EntitlementResult =
  | {
      allowed: true;
      reason: "public" | "owner" | "entitled";
      entitlementId: string | null;
    }
  | {
      allowed: false;
      reason: "no_entitlement" | "seats_exhausted" | "expired";
      entitlementId: null;
    };

interface PackageLike {
  scope: string;
  name: string;
  visibility?: string;
  ownerId?: string;
  // Some routes have an `author` field instead of `ownerId`; either works.
  author?: string;
}

function isExpired(e: Entitlement): boolean {
  if (!e.expiresAt) return false;
  return new Date(e.expiresAt).getTime() <= Date.now();
}

function versionMatches(constraint: string, _version: string): boolean {
  // Phase 1: only support "*" wildcard. Versioned constraints come later.
  if (!constraint || constraint === "*") return true;
  // For now, treat anything else as a strict equality check.
  return constraint === _version;
}

function isOwner(pkg: PackageLike, userId: string): boolean {
  return (
    pkg.ownerId === userId || pkg.author === userId
  );
}

export interface CheckEntitlementParams {
  userId: string;
  /**
   * The requester's verified email. When provided, email-pending
   * entitlements matching this email count toward access. Pass null (or
   * omit) when the email isn't verified in the auth token — unverified
   * emails are untrusted and cannot claim entitlements.
   */
  verifiedEmail?: string | null;
  pkg: PackageLike;
  version: string;
}

export async function checkEntitlement(
  params: CheckEntitlementParams,
): Promise<EntitlementResult> {
  const { userId, verifiedEmail, pkg, version } = params;

  // Feature flag: until enabled, treat every package as public.
  // This keeps existing public-package behavior unchanged in production.
  if (!isPrivatePackagesEnabled()) {
    return { allowed: true, reason: "public", entitlementId: null };
  }

  if (pkg.visibility !== "private") {
    return { allowed: true, reason: "public", entitlementId: null };
  }

  if (isOwner(pkg, userId)) {
    return { allowed: true, reason: "owner", entitlementId: null };
  }

  // Build the set of grantee keys the user matches: their own user-key,
  // one org-key per org they belong to, and (only if the email is verified
  // by Cognito) their email-key so they can claim pre-invites.
  const memberships = await listOrgsForUser(userId);
  const granteeKeys = new Set<string>([`user#${userId}`]);
  for (const m of memberships) granteeKeys.add(`org#${m.orgId}`);
  if (verifiedEmail) {
    granteeKeys.add(`email#${verifiedEmail.trim().toLowerCase()}`);
  }

  const entitlements = await listEntitlementsForPackage(pkg.scope, pkg.name);

  let sawExpired = false;
  let sawSeatsExhausted = false;

  for (const e of entitlements) {
    if (e.revokedAt) continue;
    if (!granteeKeys.has(e.granteeKey)) continue;
    if (!versionMatches(e.versionConstraint, version)) continue;
    if (isExpired(e)) {
      sawExpired = true;
      continue;
    }
    if (e.seats != null) {
      const claimed = await claimEntitlementSeat(e.entitlementId);
      if (!claimed) {
        sawSeatsExhausted = true;
        continue;
      }
    }
    return {
      allowed: true,
      reason: "entitled",
      entitlementId: e.entitlementId,
    };
  }

  if (sawSeatsExhausted) {
    return {
      allowed: false,
      reason: "seats_exhausted",
      entitlementId: null,
    };
  }
  if (sawExpired) {
    return { allowed: false, reason: "expired", entitlementId: null };
  }
  return { allowed: false, reason: "no_entitlement", entitlementId: null };
}

/**
 * Convenience helper for list/search routes — returns the subset of packages
 * the user can read. Public packages always pass; private ones must have a
 * matching entitlement OR be owned by the user.
 *
 * Note: this is N+1 by design — fine for Phase 1 small page sizes. If the
 * registry grows large, swap this for a single fan-out query.
 */
export async function filterReadableByUser<T extends PackageLike>(
  packages: T[],
  userId: string | null,
  verifiedEmail: string | null = null,
): Promise<T[]> {
  // When the flag is off, all packages are public — trivially readable.
  if (!isPrivatePackagesEnabled()) return packages;

  const out: T[] = [];
  for (const pkg of packages) {
    if (pkg.visibility !== "private") {
      out.push(pkg);
      continue;
    }
    if (!userId) continue;
    if (isOwner(pkg, userId)) {
      out.push(pkg);
      continue;
    }
    // For list views we don't claim seats — this is a visibility check, not
    // a download. We just check if any qualifying entitlement exists.
    const memberships = await listOrgsForUser(userId);
    const granteeKeys = new Set<string>([`user#${userId}`]);
    for (const m of memberships) granteeKeys.add(`org#${m.orgId}`);
    if (verifiedEmail) {
      granteeKeys.add(`email#${verifiedEmail.trim().toLowerCase()}`);
    }
    const entitlements = await listEntitlementsForPackage(pkg.scope, pkg.name);
    const hasMatch = entitlements.some(
      (e) =>
        !e.revokedAt &&
        !isExpired(e) &&
        granteeKeys.has(e.granteeKey),
    );
    if (hasMatch) out.push(pkg);
  }
  return out;
}

/**
 * Construct an entitlement record. Caller must persist via putEntitlement.
 */
export interface CreateEntitlementInput {
  packageScope: string;
  packageName: string;
  versionConstraint?: string;
  granteeType: "user" | "org" | "email";
  /**
   * For user grants: cognitoId.
   * For org grants: orgId.
   * For email grants: the email address. Callers should normalize
   *   (lowercase + trim) before passing — buildEntitlement re-normalizes
   *   defensively so stored keys are consistent.
   */
  granteeId: string;
  seats?: number | null;
  expiresAt?: string | null;
  source: string;
  createdByUserId: string;
}

export function buildEntitlement(input: CreateEntitlementInput): Entitlement {
  const now = new Date().toISOString();
  const random = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  // Email grantee keys are normalized to lowercase + trimmed so that
  // granteeKey lookups work regardless of input casing.
  const granteeId =
    input.granteeType === "email"
      ? input.granteeId.trim().toLowerCase()
      : input.granteeId;
  return {
    entitlementId: `ent_${ts}${random}`,
    packageScope: input.packageScope,
    packageName: input.packageName,
    packageKey: `${input.packageScope}#${input.packageName}`,
    versionConstraint: input.versionConstraint || "*",
    granteeType: input.granteeType,
    granteeId,
    granteeKey: `${input.granteeType}#${granteeId}`,
    seats: input.seats ?? null,
    activeSeats: 0,
    expiresAt: input.expiresAt ?? null,
    source: input.source,
    createdByUserId: input.createdByUserId,
    createdAt: now,
    claimedByUserId: null,
    claimedAt: null,
    revokedAt: null,
  };
}
