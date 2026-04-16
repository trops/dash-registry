/**
 * DynamoDB client and table helpers.
 *
 * Table names are set via environment variables (injected by Amplify).
 * Fallback names are used for local development.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import outputs from "../../amplify_outputs.json";

const custom = (outputs as Record<string, unknown>).custom as
  | Record<string, string>
  | undefined;

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLES = {
  USERS: process.env.USERS_TABLE || custom?.usersTable || "dash-registry-Users",
  PACKAGES:
    process.env.PACKAGES_TABLE ||
    custom?.packagesTable ||
    "dash-registry-Packages",
  PACKAGE_VERSIONS:
    process.env.PACKAGE_VERSIONS_TABLE ||
    custom?.packageVersionsTable ||
    "dash-registry-PackageVersions",
  USER_LIBRARY:
    process.env.USER_LIBRARY_TABLE ||
    custom?.userLibraryTable ||
    "dash-registry-UserLibrary",
  DEVICE_CODES:
    process.env.DEVICE_CODES_TABLE ||
    custom?.deviceCodesTable ||
    "dash-registry-DeviceCodes",
  ORGS: process.env.ORGS_TABLE || custom?.orgsTable || "dash-registry-Orgs",
  ORG_MEMBERSHIPS:
    process.env.ORG_MEMBERSHIPS_TABLE ||
    custom?.orgMembershipsTable ||
    "dash-registry-OrgMemberships",
  ORG_DOMAINS:
    process.env.ORG_DOMAINS_TABLE ||
    custom?.orgDomainsTable ||
    "dash-registry-OrgDomains",
  ENTITLEMENTS:
    process.env.ENTITLEMENTS_TABLE ||
    custom?.entitlementsTable ||
    "dash-registry-Entitlements",
  INSTALL_LOG:
    process.env.INSTALL_LOG_TABLE ||
    custom?.installLogTable ||
    "dash-registry-InstallLog",
};

// --- User operations ---

export async function getUserByUsername(username: string) {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLES.USERS,
      FilterExpression: "username = :u",
      ExpressionAttributeValues: { ":u": username },
      Limit: 1,
    }),
  );
  return result.Items?.[0] || null;
}

/**
 * Find a user by email address. Uses ScanCommand since Users has no
 * email GSI — fine at current scale (single-digit thousands of users),
 * worth revisiting later.
 */
export async function getUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLES.USERS,
      FilterExpression: "email = :e",
      ExpressionAttributeValues: { ":e": normalized },
      Limit: 1,
    }),
  );
  return result.Items?.[0] || null;
}

export async function getUserByCognitoId(cognitoId: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLES.USERS,
      Key: { cognitoId },
    }),
  );
  return result.Item || null;
}

export async function createUser(user: {
  cognitoId: string;
  username: string;
  email: string;
  displayName: string;
  githubUsername?: string;
  avatarUrl?: string;
}) {
  const now = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: TABLES.USERS,
      Item: { ...user, createdAt: now, updatedAt: now },
      ConditionExpression: "attribute_not_exists(cognitoId)",
    }),
  );
  return user;
}

export async function updateUser(
  cognitoId: string,
  updates: {
    displayName?: string;
    githubUsername?: string;
    email?: string;
    avatarUrl?: string;
  },
) {
  const now = new Date().toISOString();
  const expressionParts: string[] = ["#updatedAt = :updatedAt"];
  const names: Record<string, string> = { "#updatedAt": "updatedAt" };
  const values: Record<string, unknown> = { ":updatedAt": now };

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      const attr = `#${key}`;
      const placeholder = `:${key}`;
      expressionParts.push(`${attr} = ${placeholder}`);
      names[attr] = key;
      values[placeholder] = val;
    }
  }

  if (expressionParts.length === 1) return null; // nothing to update besides timestamp

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.USERS,
      Key: { cognitoId },
      UpdateExpression: `SET ${expressionParts.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );
  return result.Attributes;
}

// --- Package operations ---

export async function getPackage(scope: string, name: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLES.PACKAGES,
      Key: { scope, name },
    }),
  );
  return result.Item || null;
}

export async function putPackage(pkg: Record<string, unknown>) {
  const now = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: TABLES.PACKAGES,
      Item: { ...pkg, updatedAt: now },
    }),
  );
}

export async function listPackages(filters?: {
  search?: string;
  category?: string;
  type?: string;
  appOrigin?: string;
  providerTypes?: string[];
}) {
  // NOTE: visibility filtering happens in `filterReadableByUser` at the
  // route layer — owners + entitled users need to see private packages
  // they can read, so we can't pre-filter at the DB level. The trade-off
  // is a slightly larger scan; acceptable while the registry is small.
  const filterParts: string[] = [];
  const exprValues: Record<string, string> = {};
  const exprNames: Record<string, string> = {};

  if (filters?.category) {
    filterParts.push("category = :cat");
    exprValues[":cat"] = filters.category;
  }
  if (filters?.type) {
    filterParts.push("#t = :type");
    exprNames["#t"] = "type";
    exprValues[":type"] = filters.type;
  }
  if (filters?.appOrigin) {
    filterParts.push("appOrigin = :appOrigin");
    exprValues[":appOrigin"] = filters.appOrigin;
  }

  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLES.PACKAGES,
      ...(filterParts.length > 0 && {
        FilterExpression: filterParts.join(" AND "),
      }),
      ...(Object.keys(exprValues).length > 0 && {
        ExpressionAttributeValues: exprValues,
      }),
      ...(Object.keys(exprNames).length > 0 && {
        ExpressionAttributeNames: exprNames,
      }),
    }),
  );

  let packages = result.Items || [];

  // Client-side text search (DynamoDB doesn't support full-text)
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    packages = packages.filter(
      (pkg) =>
        (pkg.name as string)?.toLowerCase().includes(q) ||
        (pkg.displayName as string)?.toLowerCase().includes(q) ||
        (pkg.description as string)?.toLowerCase().includes(q) ||
        (pkg.author as string)?.toLowerCase().includes(q) ||
        ((pkg.tags as string[]) || []).some((t) => t.toLowerCase().includes(q)),
    );
  }

  // Client-side providerTypes filter — return packages where at least one
  // providerType matches the query. Packages without providerTypes are excluded
  // only when the filter is active.
  if (filters?.providerTypes && filters.providerTypes.length > 0) {
    const wanted = new Set(
      filters.providerTypes.map((t) => t.toLowerCase()),
    );
    packages = packages.filter((pkg) => {
      const types = (pkg.providerTypes as string[]) || [];
      return types.some((t) => wanted.has(t.toLowerCase()));
    });
  }

  return packages;
}

export async function listPackagesByScope(scope: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.PACKAGES,
      KeyConditionExpression: "#s = :scope",
      ExpressionAttributeNames: { "#s": "scope" },
      ExpressionAttributeValues: { ":scope": scope },
    }),
  );
  return result.Items || [];
}

export async function updatePackage(
  scope: string,
  name: string,
  updates: {
    description?: string;
    category?: string;
    tags?: string[];
    visibility?: string;
    displayName?: string;
  },
) {
  const now = new Date().toISOString();
  const expressionParts: string[] = ["#updatedAt = :updatedAt"];
  const names: Record<string, string> = { "#updatedAt": "updatedAt" };
  const values: Record<string, unknown> = { ":updatedAt": now };

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      const attr = `#${key}`;
      const placeholder = `:${key}`;
      expressionParts.push(`${attr} = ${placeholder}`);
      names[attr] = key;
      values[placeholder] = val;
    }
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.PACKAGES,
      Key: { scope, name },
      UpdateExpression: `SET ${expressionParts.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );
  return result.Attributes;
}

// --- PackageVersion operations ---

export async function putPackageVersion(version: Record<string, unknown>) {
  const now = new Date().toISOString();
  const sk = `${version.packageName}#${version.version}`;
  await docClient.send(
    new PutCommand({
      TableName: TABLES.PACKAGE_VERSIONS,
      Item: { ...version, sk, createdAt: now },
    }),
  );
}

export async function getPackageVersions(scope: string, name: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.PACKAGE_VERSIONS,
      KeyConditionExpression:
        "packageScope = :scope AND begins_with(sk, :namePrefix)",
      ExpressionAttributeValues: {
        ":scope": scope,
        ":namePrefix": `${name}#`,
      },
    }),
  );
  return result.Items || [];
}

export async function deletePackage(scope: string, name: string) {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLES.PACKAGES,
      Key: { scope, name },
    }),
  );
}

export async function deletePackageVersions(scope: string, name: string) {
  const versions = await getPackageVersions(scope, name);
  for (const v of versions) {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLES.PACKAGE_VERSIONS,
        Key: { packageScope: scope, sk: v.sk as string },
      }),
    );
  }
  return versions;
}

// --- UserLibrary operations ---

export async function putUserLibraryEntry(entry: Record<string, unknown>) {
  const now = new Date().toISOString();
  const sk = `${entry.packageScope}#${entry.packageName}`;
  await docClient.send(
    new PutCommand({
      TableName: TABLES.USER_LIBRARY,
      Item: { ...entry, sk, updatedAt: now, installedAt: now },
    }),
  );
}

export async function getUserLibrary(userId: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.USER_LIBRARY,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    }),
  );
  return result.Items || [];
}

// --- Org operations ---

export interface Org {
  orgId: string;
  slug: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
}

export async function putOrg(org: Org) {
  await docClient.send(
    new PutCommand({ TableName: TABLES.ORGS, Item: org }),
  );
}

export async function getOrg(orgId: string) {
  const result = await docClient.send(
    new GetCommand({ TableName: TABLES.ORGS, Key: { orgId } }),
  );
  return (result.Item as Org | undefined) || null;
}

export async function getOrgBySlug(slug: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.ORGS,
      IndexName: "slug-index",
      KeyConditionExpression: "slug = :s",
      ExpressionAttributeValues: { ":s": slug },
      Limit: 1,
    }),
  );
  return (result.Items?.[0] as Org | undefined) || null;
}

export interface OrgMembership {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
}

export async function putOrgMembership(m: OrgMembership) {
  await docClient.send(
    new PutCommand({ TableName: TABLES.ORG_MEMBERSHIPS, Item: m }),
  );
}

export async function getOrgMembership(orgId: string, userId: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLES.ORG_MEMBERSHIPS,
      Key: { orgId, userId },
    }),
  );
  return (result.Item as OrgMembership | undefined) || null;
}

export async function deleteOrgMembership(orgId: string, userId: string) {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLES.ORG_MEMBERSHIPS,
      Key: { orgId, userId },
    }),
  );
}

export async function listOrgMembers(orgId: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.ORG_MEMBERSHIPS,
      KeyConditionExpression: "orgId = :o",
      ExpressionAttributeValues: { ":o": orgId },
    }),
  );
  return (result.Items as OrgMembership[] | undefined) || [];
}

export async function listOrgsForUser(userId: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.ORG_MEMBERSHIPS,
      IndexName: "ByUser",
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
    }),
  );
  return (result.Items as OrgMembership[] | undefined) || [];
}

// --- OrgDomain operations ---

export interface OrgDomain {
  orgId: string;
  domain: string;
  // Token the user must add as a DNS TXT record at _dash-verify.<domain>
  verificationToken: string;
  // ISO timestamp when DNS verification succeeded; null while pending.
  verifiedAt: string | null;
  createdByUserId: string;
  createdAt: string;
}

export async function putOrgDomain(d: OrgDomain) {
  await docClient.send(
    new PutCommand({ TableName: TABLES.ORG_DOMAINS, Item: d }),
  );
}

export async function getOrgDomain(orgId: string, domain: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLES.ORG_DOMAINS,
      Key: { orgId, domain },
    }),
  );
  return (result.Item as OrgDomain | undefined) || null;
}

export async function listOrgDomains(orgId: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.ORG_DOMAINS,
      KeyConditionExpression: "orgId = :o",
      ExpressionAttributeValues: { ":o": orgId },
    }),
  );
  return (result.Items as OrgDomain[] | undefined) || [];
}

export async function deleteOrgDomain(orgId: string, domain: string) {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLES.ORG_DOMAINS,
      Key: { orgId, domain },
    }),
  );
}

/**
 * Mark a domain verified (idempotent). Sets verifiedAt = now if not
 * already verified.
 */
export async function markOrgDomainVerified(orgId: string, domain: string) {
  const now = new Date().toISOString();
  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.ORG_DOMAINS,
      Key: { orgId, domain },
      UpdateExpression: "SET verifiedAt = :now",
      ConditionExpression: "attribute_exists(orgId)",
      ExpressionAttributeValues: { ":now": now },
      ReturnValues: "ALL_NEW",
    }),
  );
  return result.Attributes as OrgDomain | undefined;
}

/**
 * Returns all orgs that have claimed this domain. Ordinarily this is
 * zero or one — the verification step ensures a single owner in
 * practice — but we return the list in case of a race.
 */
export async function listOrgsForDomain(domain: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.ORG_DOMAINS,
      IndexName: "ByDomain",
      KeyConditionExpression: "#d = :d",
      ExpressionAttributeNames: { "#d": "domain" },
      ExpressionAttributeValues: { ":d": domain.trim().toLowerCase() },
    }),
  );
  return (result.Items as OrgDomain[] | undefined) || [];
}

// --- Entitlement operations ---

/**
 * granteeType "email" is used for pre-invites — entitlements granted to
 * an email address before the recipient has signed up. When the recipient
 * signs in with a verified email matching the entitlement, it's either
 * matched on every install (via checkEntitlement) or converted to a
 * granteeType "user" record via the claim flow.
 */
export interface Entitlement {
  entitlementId: string;
  packageScope: string;
  packageName: string;
  packageKey: string; // GSI PK: "scope#name"
  versionConstraint: string; // "*" or semver range
  granteeType: "user" | "org" | "email";
  granteeId: string; // userId | orgId | lowercased-email
  granteeKey: string; // GSI PK: "user#userId" | "org#orgId" | "email#email"
  seats: number | null;
  activeSeats: number;
  expiresAt: string | null;
  source: string; // "publisher", "manual", "invite", ...
  createdByUserId: string;
  createdAt: string;
  // Set when an email grant is claimed by a signed-in user. Retained for
  // audit so the owner can see "this email grant was claimed by @alice
  // on 2026-04-13".
  claimedByUserId: string | null;
  claimedAt: string | null;
  revokedAt: string | null;
}

export async function putEntitlement(e: Entitlement) {
  await docClient.send(
    new PutCommand({ TableName: TABLES.ENTITLEMENTS, Item: e }),
  );
}

export async function getEntitlement(entitlementId: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLES.ENTITLEMENTS,
      Key: { entitlementId },
    }),
  );
  return (result.Item as Entitlement | undefined) || null;
}

export async function listEntitlementsForPackage(
  scope: string,
  name: string,
) {
  const packageKey = `${scope}#${name}`;
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.ENTITLEMENTS,
      IndexName: "ByPackage",
      KeyConditionExpression: "packageKey = :pk",
      ExpressionAttributeValues: { ":pk": packageKey },
    }),
  );
  return (result.Items as Entitlement[] | undefined) || [];
}

export async function listEntitlementsForGrantee(
  granteeType: "user" | "org" | "email",
  granteeId: string,
) {
  const granteeKey = `${granteeType}#${granteeId}`;
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.ENTITLEMENTS,
      IndexName: "ByGrantee",
      KeyConditionExpression: "granteeKey = :gk",
      ExpressionAttributeValues: { ":gk": granteeKey },
    }),
  );
  return (result.Items as Entitlement[] | undefined) || [];
}

export async function revokeEntitlement(entitlementId: string) {
  const now = new Date().toISOString();
  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.ENTITLEMENTS,
      Key: { entitlementId },
      UpdateExpression: "SET revokedAt = :r",
      ExpressionAttributeValues: { ":r": now },
      ReturnValues: "ALL_NEW",
    }),
  );
  return result.Attributes as Entitlement | undefined;
}

/**
 * Convert an email-pending entitlement into a user entitlement. Called
 * during sign-in when an email entitlement matches the user's verified
 * email. The granteeKey is rewritten so the ByGrantee GSI now returns
 * this entitlement under the user's cognitoId.
 *
 * ConditionExpression guards against double-claim and against claiming
 * revoked entitlements.
 */
export async function claimEmailEntitlement(
  entitlementId: string,
  userId: string,
) {
  const now = new Date().toISOString();
  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLES.ENTITLEMENTS,
        Key: { entitlementId },
        UpdateExpression:
          "SET granteeType = :u, granteeId = :uid, granteeKey = :gk, claimedByUserId = :uid, claimedAt = :now",
        ConditionExpression:
          "attribute_exists(entitlementId) AND granteeType = :e AND claimedByUserId = :null AND revokedAt = :null",
        ExpressionAttributeValues: {
          ":u": "user",
          ":e": "email",
          ":uid": userId,
          ":gk": `user#${userId}`,
          ":now": now,
          ":null": null,
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    return result.Attributes as Entitlement | undefined;
  } catch {
    return null;
  }
}

/**
 * Atomically increment activeSeats when seats is bounded.
 * Returns true if seat was claimed, false if already at capacity or revoked.
 */
export async function claimEntitlementSeat(entitlementId: string) {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.ENTITLEMENTS,
        Key: { entitlementId },
        UpdateExpression: "ADD activeSeats :one",
        ConditionExpression:
          "attribute_exists(entitlementId) AND revokedAt = :null AND (attribute_not_exists(seats) OR seats = :null OR activeSeats < seats)",
        ExpressionAttributeValues: { ":one": 1, ":null": null },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

// --- InstallLog operations ---

export interface InstallLogEntry {
  userId: string;
  sk: string; // "{requestedAt}#{entitlementId|public}"
  packageScope: string;
  packageName: string;
  version: string;
  result:
    | "granted_public"
    | "granted_owner"
    | "granted_entitlement"
    | "denied_no_entitlement"
    | "denied_seats_exhausted"
    | "denied_expired";
  entitlementId: string | null;
  ipHash: string | null;
  userAgent: string | null;
  requestedAt: string;
  expiresAt: number; // epoch seconds, DynamoDB TTL
}

export async function putInstallLog(entry: InstallLogEntry) {
  await docClient.send(
    new PutCommand({ TableName: TABLES.INSTALL_LOG, Item: entry }),
  );
}
