/**
 * Org helper module.
 *
 * Thin wrappers over db.ts org operations + small business logic
 * (creating an org auto-adds the creator as owner, slug uniqueness check).
 */
import {
  putOrg,
  getOrg as getOrgRaw,
  getOrgBySlug,
  putOrgMembership,
  getOrgMembership,
  deleteOrgMembership,
  listOrgMembers,
  listOrgsForUser as listOrgsForUserRaw,
  type Org,
  type OrgMembership,
} from "./db";

export type { Org, OrgMembership };

function generateOrgId(): string {
  // Short, URL-safe, sortable-ish identifier
  const random = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `org_${ts}${random}`;
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug);
}

export interface CreateOrgInput {
  slug: string;
  name: string;
  ownerUserId: string;
}

export async function createOrg(input: CreateOrgInput): Promise<Org> {
  const slug = input.slug.trim().toLowerCase();
  if (!isValidSlug(slug)) {
    throw new Error(
      "Invalid slug — must be 3-40 chars, lowercase letters, digits, hyphens",
    );
  }
  const existing = await getOrgBySlug(slug);
  if (existing) {
    throw new Error(`Slug "${slug}" is already taken`);
  }
  const now = new Date().toISOString();
  const org: Org = {
    orgId: generateOrgId(),
    slug,
    name: input.name.trim(),
    ownerUserId: input.ownerUserId,
    createdAt: now,
  };
  await putOrg(org);
  await putOrgMembership({
    orgId: org.orgId,
    userId: input.ownerUserId,
    role: "owner",
    joinedAt: now,
  });
  return org;
}

export async function getOrg(orgId: string) {
  return getOrgRaw(orgId);
}

export async function addMember(
  orgId: string,
  userId: string,
  role: OrgMembership["role"] = "member",
) {
  const existing = await getOrgMembership(orgId, userId);
  if (existing) return existing;
  const m: OrgMembership = {
    orgId,
    userId,
    role,
    joinedAt: new Date().toISOString(),
  };
  await putOrgMembership(m);
  return m;
}

export async function removeMember(orgId: string, userId: string) {
  const existing = await getOrgMembership(orgId, userId);
  if (!existing) return false;
  if (existing.role === "owner") {
    throw new Error("Cannot remove the org owner");
  }
  await deleteOrgMembership(orgId, userId);
  return true;
}

export async function getOrgsForUser(userId: string) {
  const memberships = await listOrgsForUserRaw(userId);
  // Hydrate org details — small N, parallel fetch is fine
  const orgs = await Promise.all(
    memberships.map(async (m) => ({
      membership: m,
      org: await getOrgRaw(m.orgId),
    })),
  );
  return orgs.filter((x) => x.org !== null) as Array<{
    membership: OrgMembership;
    org: Org;
  }>;
}

export async function getMembers(orgId: string) {
  return listOrgMembers(orgId);
}

export async function isMember(orgId: string, userId: string) {
  const m = await getOrgMembership(orgId, userId);
  return m !== null;
}

export async function isAdmin(orgId: string, userId: string) {
  const m = await getOrgMembership(orgId, userId);
  return m !== null && (m.role === "owner" || m.role === "admin");
}
