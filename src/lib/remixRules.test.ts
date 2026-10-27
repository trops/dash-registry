import { describe, it, expect } from "vitest";
import {
  effectiveAllowRemix,
  allowRemixOnPublish,
  remixFieldErrors,
  parseRemixedFrom,
  remixDecision,
} from "./remixRules";
import { validateManifest } from "./validate";

describe("effectiveAllowRemix", () => {
  it("the owner's choice, else public yes / private no", () => {
    expect(effectiveAllowRemix({ visibility: "public" })).toBe(true);
    expect(effectiveAllowRemix({ visibility: "private" })).toBe(false);
    expect(effectiveAllowRemix({})).toBe(true);
    expect(
      effectiveAllowRemix({ visibility: "private", allowRemix: true }),
    ).toBe(true);
    expect(
      effectiveAllowRemix({ visibility: "public", allowRemix: false }),
    ).toBe(false);
    expect(effectiveAllowRemix(null)).toBe(false);
  });
});

describe("allowRemixOnPublish", () => {
  it("a new package stores nothing: it follows its visibility (made private later, it stops being remixable)", () => {
    expect(allowRemixOnPublish(undefined, null)).toBeUndefined();
  });
  it("the manifest decides when it says", () => {
    expect(allowRemixOnPublish(true, null)).toBe(true);
    expect(allowRemixOnPublish(false, { allowRemix: true })).toBe(false);
  });
  it("a later version keeps the owner's choice", () => {
    expect(allowRemixOnPublish(undefined, { allowRemix: false })).toBe(false);
    expect(
      allowRemixOnPublish(undefined, { visibility: "private" }),
    ).toBeUndefined();
  });
});

describe("manifest fields", () => {
  it("checks allowRemix and remixedFrom", () => {
    expect(remixFieldErrors({})).toEqual([]);
    expect(remixFieldErrors({ allowRemix: "yes" })).toEqual([
      '"allowRemix" must be true or false',
    ]);
    expect(
      remixFieldErrors({
        remixedFrom: { scope: "@trops", name: "kitchen-sink", version: "1.0.0" },
      }),
    ).toEqual([]);
    expect(
      remixFieldErrors({
        remixedFrom: { scope: "../x", name: "Kitchen", version: "one" },
      }),
    ).toHaveLength(3);
    expect(remixFieldErrors({ remixedFrom: "trops/x" })).toEqual([
      '"remixedFrom" must be an object',
    ]);
  });

  it("validateManifest refuses a bad remixedFrom", () => {
    const res = validateManifest({
      scope: "bob",
      name: "my-theme",
      displayName: "My Theme",
      version: "1.0.0",
      type: "theme",
      colors: { primary: "a", secondary: "b", tertiary: "c" },
      remixedFrom: { scope: "trops", name: "Bad Name", version: "1.0.0" },
    } as never);
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toMatch(/remixedFrom\.name/);
  });

  it("parseRemixedFrom strips the @", () => {
    expect(
      parseRemixedFrom({ scope: "@trops", name: "x-y", version: "1.0.0" }),
    ).toEqual({ scope: "trops", name: "x-y", version: "1.0.0" });
    expect(parseRemixedFrom(null)).toBeNull();
  });
});

describe("remixDecision", () => {
  const ref = { scope: "trops", name: "kitchen-sink", version: "1.2.0" };
  const original = {
    scope: "trops",
    name: "kitchen-sink",
    displayName: "Kitchen Sink",
    author: "Trops",
    visibility: "public",
    ownerId: "owner-1",
  };

  it("a public original: allowed, credited with the registry's names", () => {
    const d = remixDecision({
      ref,
      original,
      publisherId: "bob-1",
      canRead: false,
    });
    expect(d).toEqual({
      ok: true,
      credit: {
        scope: "trops",
        name: "kitchen-sink",
        version: "1.2.0",
        displayName: "Kitchen Sink",
        author: "Trops",
      },
    });
  });

  it("refused when the author doesn't allow remixes", () => {
    const d = remixDecision({
      ref,
      original: { ...original, allowRemix: false },
      publisherId: "bob-1",
      canRead: true,
    });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.status).toBe(403);
      expect(d.error).toMatch(/doesn't allow remixes/);
    }
  });

  it("a private original: refused by default, even for someone it was shared with", () => {
    const shared = remixDecision({
      ref,
      original: { ...original, visibility: "private" },
      publisherId: "customer-1",
      canRead: true,
    });
    expect(shared.ok).toBe(false);
    const notShared = remixDecision({
      ref,
      original: { ...original, visibility: "private", allowRemix: true },
      publisherId: "stranger-1",
      canRead: false,
    });
    expect(notShared.ok).toBe(false);
    // The same answer as a package that doesn't exist: nothing leaks.
    const missing = remixDecision({
      ref,
      original: null,
      publisherId: "stranger-1",
      canRead: false,
    });
    expect(notShared).toEqual(missing);
    if (!notShared.ok) {
      expect(notShared.status).toBe(404);
      expect(notShared.error).toMatch(/isn't a package you can remix/);
    }
    const allowed = remixDecision({
      ref,
      original: { ...original, visibility: "private", allowRemix: true },
      publisherId: "client-1",
      canRead: true,
    });
    expect(allowed.ok).toBe(true);
  });

  it("the owner can always remix their own", () => {
    const d = remixDecision({
      ref,
      original: { ...original, visibility: "private", allowRemix: false },
      publisherId: "owner-1",
      canRead: false,
    });
    expect(d.ok).toBe(true);
  });

  it("a remix of a remix carries the first original", () => {
    const d = remixDecision({
      ref: { scope: "alice", name: "sink-plus", version: "2.0.0" },
      original: {
        displayName: "Sink Plus",
        author: "Alice",
        visibility: "public",
        ownerId: "alice-1",
        remixedFrom: {
          scope: "trops",
          name: "kitchen-sink",
          version: "1.0.0",
          displayName: "Kitchen Sink",
          author: "Trops",
        },
      },
      publisherId: "bob-1",
      canRead: false,
    });
    expect(d.ok && d.credit?.root).toEqual({
      scope: "trops",
      name: "kitchen-sink",
      displayName: "Kitchen Sink",
      author: "Trops",
    });
  });

  it("the owner of an older package that kept only an author can remix it", () => {
    const d = remixDecision({
      ref,
      original: {
        ...original,
        ownerId: undefined,
        author: "owner-1",
        visibility: "private",
        allowRemix: false,
      },
      publisherId: "owner-1",
      canRead: false,
    });
    expect(d.ok).toBe(true);
  });

  const previous = {
    scope: "trops",
    name: "kitchen-sink",
    version: "1.0.0",
    displayName: "Kitchen Sink",
    author: "Trops",
  };

  it("a later version stays a remix of the same original", () => {
    const d = remixDecision({
      ref: { scope: "x", name: "made-up", version: "1.0.0" },
      original: null,
      publisherId: "bob-1",
      canRead: false,
      previous,
    });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.status).toBe(409);
    const same = remixDecision({
      ref: { ...ref, version: "1.3.0" },
      original,
      publisherId: "bob-1",
      canRead: false,
      previous,
    });
    expect(same.ok && same.credit?.version).toBe("1.3.0");
  });

  it("an original deleted since an earlier version credited it keeps the credit", () => {
    const d = remixDecision({
      ref: { ...ref, version: "1.4.0" },
      original: null,
      publisherId: "bob-1",
      canRead: false,
      previous,
    });
    expect(d).toEqual({
      ok: true,
      credit: { ...previous, version: "1.4.0" },
    });
  });
});
