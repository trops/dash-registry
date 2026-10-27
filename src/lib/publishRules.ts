/**
 * Rules a publish must pass against what the registry already has.
 *
 * - A published version never changes: publishing a version that already
 *   exists is refused (it used to silently replace the zip and record, so
 *   an "exact version" someone pinned could change under them).
 * - `latestVersion` only moves forward: publishing an older version (a
 *   patch to an old line) doesn't make it the latest.
 * - A package keeps its kind: a dashboard can't be published over a
 *   widget (or bot, theme…) of the same name.
 */

export interface ExistingPackage {
  type?: string | null;
  latestVersion?: string | null;
}

type Parsed = { nums: [number, number, number]; pre: string | null };

function parse(version: string): Parsed | null {
  const m = String(version || "").match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/,
  );
  if (!m) return null;
  return {
    nums: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] || null,
  };
}

/** > 0 when a is newer than b, < 0 when older, 0 when equal or unparseable. */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
  }
  // A release is newer than its pre-releases.
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  return pa.pre < pb.pre ? -1 : 1;
}

/** The latest version after publishing `version`: never goes backwards. */
export function nextLatestVersion(
  currentLatest: string | null | undefined,
  version: string,
): string {
  if (!currentLatest) return version;
  return compareVersions(version, currentLatest) > 0 ? version : currentLatest;
}

/**
 * Why this publish must be refused (HTTP 409), or null when it's fine.
 * `versionExists`: the registry already has this exact version.
 */
export function publishConflict(params: {
  scope: string;
  name: string;
  version: string;
  type?: string | null;
  existing: ExistingPackage | null;
  versionExists: boolean;
}): string | null {
  const { scope, name, version, type, existing, versionExists } = params;
  const id = `${scope}/${name}`;
  if (existing) {
    const was = existing.type || "widget";
    const now = type || "widget";
    if (was !== now) {
      return `"${id}" is already a ${was} package — a ${now} can't be published under the same name. Choose another name.`;
    }
  }
  if (versionExists) {
    const latest = existing && existing.latestVersion;
    return `Version ${version} of "${id}" is already published and can't be replaced. Publish a newer version${
      latest ? ` (the latest is ${latest})` : ""
    }.`;
  }
  return null;
}
