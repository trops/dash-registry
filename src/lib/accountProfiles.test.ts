import { describe, it, expect } from "vitest";
import {
  MAX_PROFILE_BYTES,
  PROFILE_SK_PREFIX,
  isProfileId,
  isListedProfile,
  isStoredProfile,
  profileSk,
  profileSummary,
  readProfileBody,
  saveConflict,
  storedProfile,
} from "./accountProfiles";

const manifest = {
  kind: "dash-profile",
  schemaVersion: 2,
  name: "Mac Mini",
  createdOn: "laptop",
  dashboards: {},
};

describe("ids", () => {
  it("accepts the app's profile ids and refuses others", () => {
    expect(isProfileId("p-mvr60dey9o1q")).toBe(true);
    expect(isProfileId("default")).toBe(true);
    expect(isProfileId("../x")).toBe(false);
    expect(isProfileId("")).toBe(false);
    expect(isProfileId("a".repeat(65))).toBe(false);
    expect(profileSk("abc")).toBe("~profile#abc");
    // A library row is "scope#name" and scopes start with a letter or digit.
    expect("profile#mini".startsWith(PROFILE_SK_PREFIX)).toBe(false);
  });
});

describe("readProfileBody", () => {
  it("a v2 profile", () => {
    const r = readProfileBody({ manifest });
    expect("manifest" in r && r.manifest.name).toBe("Mac Mini");
  });
  it("refuses anything else", () => {
    expect(readProfileBody(null)).toEqual({
      error: "Send the profile as JSON.",
    });
    expect(
      "error" in
        readProfileBody({ manifest: { ...manifest, schemaVersion: 1 } }),
    ).toBe(true);
    expect(
      "error" in readProfileBody({ manifest: { ...manifest, name: "" } }),
    ).toBe(true);
    expect(
      "error" in readProfileBody({ manifest: { ...manifest, name: "   " } }),
    ).toBe(true);
    expect(
      "error" in
        readProfileBody({ manifest: { ...manifest, name: "n".repeat(61) } }),
    ).toBe(true);
    const big = { ...manifest, pad: "x".repeat(MAX_PROFILE_BYTES) };
    const r = readProfileBody({ manifest: big });
    expect("error" in r && r.error).toMatch(/too big/);
  });
});

describe("saveConflict", () => {
  it("a first save, or a save from the revision the account has", () => {
    expect(saveConflict(null, null)).toBeNull();
    expect(saveConflict({ revision: 3 }, 3)).toBeNull();
  });
  it("never over a newer copy", () => {
    expect(saveConflict({ revision: 4 }, 3)).toMatch(/newer copy/);
    expect(saveConflict({ revision: 1 }, null)).toMatch(
      /already in your account/,
    );
    expect(saveConflict(null, 2)).toMatch(/isn't in your account any more/);
    expect(saveConflict({ revision: 1 }, "1")).toMatch(
      /already in your account/,
    );
  });
});

describe("storedProfile", () => {
  it("counts the revision up and records when and where", () => {
    const item = storedProfile({
      userId: "u1",
      profileId: "mini",
      manifest,
      json: JSON.stringify(manifest),
      previousRevision: 2,
      now: "2026-10-27T12:00:00.000Z",
    });
    expect(item.sk).toBe("~profile#mini");
    expect(item.revision).toBe(3);
    expect(item.updatedOn).toBe("laptop");
    expect(JSON.parse(item.body).revision).toBe(3);
    expect(item.size).toBe(Buffer.byteLength(item.body, "utf8"));
    expect(profileSummary(item)).toEqual({
      id: "mini",
      name: "Mac Mini",
      revision: 3,
      updatedAt: "2026-10-27T12:00:00.000Z",
      updatedOn: "laptop",
      size: item.size,
    });
  });
});

describe("first save and stored rows", () => {
  it("starts at revision 1 and replaces a revision in the file", () => {
    const item = storedProfile({
      userId: "u1",
      profileId: "mini",
      manifest: { ...manifest, revision: 99 },
      json: "",
      previousRevision: null,
      now: "2026-10-27T12:00:00.000Z",
    });
    expect(item.revision).toBe(1);
    expect(JSON.parse(item.body).revision).toBe(1);
    expect(isStoredProfile(item)).toBe(true);
  });
  it("a library row isn't a profile", () => {
    expect(
      isStoredProfile({
        userId: "u1",
        sk: "trops#clock",
        packageName: "clock",
      }),
    ).toBe(false);
    expect(isStoredProfile(null)).toBe(false);
  });
});

describe("listed rows", () => {
  it("a listed profile has no body (the list doesn't fetch it) and still counts", () => {
    const listed = {
      profileId: "mini",
      name: "Mac Mini",
      revision: 2,
      updatedAt: "t",
      updatedOn: null,
      size: 10,
    };
    expect(isListedProfile(listed)).toBe(true);
    expect(isStoredProfile(listed)).toBe(false);
    expect(isListedProfile({ sk: "trops#clock" })).toBe(false);
  });
});
