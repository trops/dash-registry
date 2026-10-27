/**
 * Remixes: publishing your own version of someone else's package, with
 * credit (user decisions, 2026-10-27).
 *
 * - Each package says whether it may be remixed (`allowRemix`). The owner
 *   decides; by default public packages may be and private ones (shared or,
 *   later, paid) may not, so private work isn't republished by the people
 *   it was shared with.
 * - A publish that says it's a remix (`remixedFrom`) is refused when the
 *   original doesn't allow it, or when the publisher can't read a private
 *   original. Otherwise the credit is stored — with the original author's
 *   name from the registry, never from the manifest, so it can't be faked
 *   — and carried back to the first original through a chain of remixes.
 */

export interface RemixRef {
  scope: string;
  name: string;
  version: string;
}

export interface RemixCredit {
  scope: string;
  name: string;
  version: string;
  displayName: string;
  author: string;
  // The first original, when the parent is itself a remix.
  root?: { scope: string; name: string; displayName: string; author: string };
}

export interface OriginalPackage {
  scope?: string;
  name?: string;
  displayName?: string;
  author?: string;
  visibility?: string | null;
  ownerId?: string;
  allowRemix?: boolean | null;
  remixedFrom?: RemixCredit | null;
}

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SCOPE = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+)?$/;

/** Whether a package may be remixed: what its owner chose, else by visibility. */
export function effectiveAllowRemix(pkg: OriginalPackage | null): boolean {
  if (!pkg) return false;
  if (typeof pkg.allowRemix === "boolean") return pkg.allowRemix;
  return pkg.visibility !== "private";
}

/**
 * The `allowRemix` to store on publish: the manifest's when it says; else
 * the package keeps its own. Undefined (nothing stored) means the package
 * follows its visibility until the owner chooses — so a public package made
 * private later stops being remixable.
 */
export function allowRemixOnPublish(
  manifestValue: unknown,
  existing: OriginalPackage | null,
): boolean | undefined {
  if (typeof manifestValue === "boolean") return manifestValue;
  return existing && typeof existing.allowRemix === "boolean"
    ? existing.allowRemix
    : undefined;
}

/** Problems with a manifest's `allowRemix` / `remixedFrom`, for validation. */
export function remixFieldErrors(manifest: {
  allowRemix?: unknown;
  remixedFrom?: unknown;
}): string[] {
  const errors: string[] = [];
  if (
    manifest.allowRemix !== undefined &&
    typeof manifest.allowRemix !== "boolean"
  ) {
    errors.push('"allowRemix" must be true or false');
  }
  const r = manifest.remixedFrom;
  if (r === undefined || r === null) return errors;
  if (typeof r !== "object" || Array.isArray(r)) {
    errors.push('"remixedFrom" must be an object');
    return errors;
  }
  const ref = r as Record<string, unknown>;
  const scope = String(ref.scope ?? "").replace(/^@/, "");
  if (!SCOPE.test(scope)) errors.push('"remixedFrom.scope" is invalid');
  if (typeof ref.name !== "string" || !KEBAB_CASE.test(ref.name)) {
    errors.push('"remixedFrom.name" must be kebab-case');
  }
  if (typeof ref.version !== "string" || !SEMVER.test(ref.version)) {
    errors.push('"remixedFrom.version" must be valid semver');
  }
  return errors;
}

/** The manifest's `remixedFrom` as a ref (validated first), or null. */
export function parseRemixedFrom(raw: unknown): RemixRef | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || typeof r.version !== "string") return null;
  const scope = String(r.scope ?? "").replace(/^@/, "");
  if (!scope) return null;
  return { scope, name: r.name, version: r.version };
}

export type RemixDecision =
  | { ok: true; credit: RemixCredit | null }
  | { ok: false; status: 403 | 404 | 409; error: string };

/**
 * Whether a publish that says it's a remix of `ref` may go ahead, and the
 * credit to store.
 *
 * @param original     the original's package record (null: not in the
 *                     registry)
 * @param publisherId  the publisher's user id
 * @param canRead      whether the publisher may read a private original
 *                     (owner or entitled)
 * @param previous     the credit this package already has (an earlier
 *                     version was a remix): a package stays a remix of the
 *                     same original
 */
export function remixDecision(params: {
  ref: RemixRef;
  original: OriginalPackage | null;
  publisherId: string;
  canRead: boolean;
  previous?: RemixCredit | null;
}): RemixDecision {
  const { ref, original, publisherId, canRead, previous } = params;
  const id = `${ref.scope}/${ref.name}`;
  const sameAsBefore =
    !!previous &&
    previous.scope.toLowerCase() === ref.scope.toLowerCase() &&
    previous.name === ref.name;
  if (previous && !sameAsBefore) {
    return {
      ok: false,
      status: 409,
      error: `This package is a remix of "${previous.scope}/${previous.name}"; a later version can't credit a different package.`,
    };
  }
  // Not there, or private and not the publisher's to read: the same answer
  // either way, so it says nothing about whether a private package exists.
  const notRemixable: RemixDecision = {
    ok: false,
    status: 404,
    error: `"${id}" isn't a package you can remix.`,
  };
  if (!original) {
    // Deleted since an earlier version credited it: the credit stays.
    return sameAsBefore && previous
      ? { ok: true, credit: { ...previous, version: ref.version } }
      : notRemixable;
  }
  const ownerId = original.ownerId || original.author;
  const ownsOriginal = !!ownerId && ownerId === publisherId;
  if (!ownsOriginal) {
    if (original.visibility === "private" && !canRead) {
      return notRemixable;
    }
    if (!effectiveAllowRemix(original)) {
      return {
        ok: false,
        status: 403,
        error: `The author of "${id}" doesn't allow remixes.`,
      };
    }
  }
  const parent = original.remixedFrom || null;
  const root = parent
    ? parent.root || {
        scope: parent.scope,
        name: parent.name,
        displayName: parent.displayName,
        author: parent.author,
      }
    : undefined;
  return {
    ok: true,
    credit: {
      scope: ref.scope,
      name: ref.name,
      version: ref.version,
      displayName: original.displayName || ref.name,
      author: original.author || "",
      ...(root ? { root } : {}),
    },
  };
}
