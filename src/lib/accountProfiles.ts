/**
 * Dash profiles kept in the user's account (dash-profiles step 2): the same
 * v2 profile a .dashprofile file holds — packages at exact versions plus
 * settings, never keys — stored per user in the UserLibrary table under a
 * `~profile#<id>` sort key (no new table or permissions; user decision,
 * 2026-10-27).
 *
 * Saves are checked against the revision the app last saw, so a save can
 * never overwrite a newer copy saved from another computer.
 */

// Well under DynamoDB's 400 KB item limit; a profile is usually a few KB.
export const MAX_PROFILE_BYTES = 350_000;
// Package scopes start with a letter or digit, so a library row ("scope#name")
// can never share this prefix.
export const PROFILE_SK_PREFIX = "~profile#";
const PROFILE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface StoredProfile {
  userId: string;
  sk: string;
  profileId: string;
  name: string;
  revision: number;
  updatedAt: string;
  updatedOn: string | null;
  size: number;
  body: string;
}

export function isProfileId(id: unknown): id is string {
  return typeof id === "string" && PROFILE_ID.test(id);
}

export function profileSk(id: string): string {
  return `${PROFILE_SK_PREFIX}${id}`;
}

/** A profile from a request body, checked: `{ manifest, json }` or `{ error }`. */
export function readProfileBody(
  body: unknown,
): { manifest: Record<string, unknown>; json: string } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Send the profile as JSON." };
  }
  const manifest = (body as { manifest?: unknown }).manifest;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { error: '"manifest" must be the profile.' };
  }
  const m = manifest as Record<string, unknown>;
  // v2: packages at exact versions; v3: the user's setup (dashboards, bots,
  // themes, folders) kept in the profile, with widgets by version.
  if (
    m.kind !== "dash-profile" ||
    (m.schemaVersion !== 2 && m.schemaVersion !== 3)
  ) {
    return { error: "That isn't a Dash profile this registry keeps." };
  }
  if (typeof m.name !== "string" || !m.name.trim() || m.name.length > 60) {
    return { error: "The profile needs a name (60 characters or fewer)." };
  }
  const json = JSON.stringify(m);
  if (Buffer.byteLength(json, "utf8") > MAX_PROFILE_BYTES) {
    return {
      error: `The profile is too big to keep in your account (over ${Math.round(
        MAX_PROFILE_BYTES / 1000,
      )} KB).`,
    };
  }
  return { manifest: m, json };
}

/**
 * Whether a save may go ahead: `baseRevision` is the revision the app last
 * saw (null for a profile it has never saved). Null when fine, else why
 * (HTTP 409).
 */
export function saveConflict(
  existing: { revision?: number } | null,
  baseRevision: unknown,
): string | null {
  const base =
    typeof baseRevision === "number" && Number.isInteger(baseRevision)
      ? baseRevision
      : null;
  if (!existing) {
    return base === null
      ? null
      : "This profile isn't in your account any more — save it as new.";
  }
  if (base === null) {
    return "A profile with this id is already in your account — load it first.";
  }
  if (existing.revision !== base) {
    return "Your account has a newer copy of this profile, saved from another computer.";
  }
  return null;
}

/** Whether a row is a stored profile (not a library entry). */
export function isStoredProfile(item: unknown): item is StoredProfile {
  const i = item as Partial<StoredProfile> | null;
  return (
    !!i &&
    typeof i.profileId === "string" &&
    typeof i.body === "string" &&
    typeof i.revision === "number"
  );
}

/**
 * Whether a listed row is a stored profile. The list fetches no body (it
 * can be large), so this checks only what the list fetches.
 */
export function isListedProfile(
  item: unknown,
): item is Omit<StoredProfile, "body" | "userId" | "sk"> {
  const i = item as Partial<StoredProfile> | null;
  return (
    !!i && typeof i.profileId === "string" && typeof i.revision === "number"
  );
}

/** What the list shows for a stored profile. */
export function profileSummary(
  item: Pick<
    StoredProfile,
    "profileId" | "name" | "revision" | "updatedAt" | "updatedOn" | "size"
  >,
) {
  return {
    id: item.profileId,
    name: item.name,
    revision: item.revision,
    updatedAt: item.updatedAt,
    updatedOn: item.updatedOn,
    size: item.size,
  };
}

/** The row to store for a save that passed `saveConflict`. */
export function storedProfile(params: {
  userId: string;
  profileId: string;
  manifest: Record<string, unknown>;
  json: string;
  previousRevision: number | null;
  now: string;
}): StoredProfile {
  const revision = (params.previousRevision || 0) + 1;
  const body = JSON.stringify({ ...params.manifest, revision });
  return {
    userId: params.userId,
    sk: profileSk(params.profileId),
    profileId: params.profileId,
    name: String(params.manifest.name).trim(),
    revision,
    updatedAt: params.now,
    updatedOn:
      typeof params.manifest.createdOn === "string"
        ? params.manifest.createdOn.slice(0, 100)
        : null,
    size: Buffer.byteLength(body, "utf8"),
    body,
  };
}
