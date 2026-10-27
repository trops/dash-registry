import { describe, it, expect } from "vitest";
import {
  compareVersions,
  nextLatestVersion,
  publishConflict,
} from "./publishRules";

describe("compareVersions", () => {
  it("orders by major, minor, patch", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "2.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
  it("a release is newer than its pre-release", () => {
    expect(compareVersions("1.0.0", "1.0.0-beta")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBeLessThan(0);
  });
});

describe("nextLatestVersion", () => {
  it("moves forward, never back", () => {
    expect(nextLatestVersion(null, "1.0.0")).toBe("1.0.0");
    expect(nextLatestVersion("1.0.0", "1.0.1")).toBe("1.0.1");
    expect(nextLatestVersion("2.0.0", "1.4.1")).toBe("2.0.0");
  });
});

describe("publishConflict", () => {
  const base = { scope: "trops", name: "weather", version: "1.0.1" };

  it("a new package or a new version is fine", () => {
    expect(
      publishConflict({ ...base, type: "dashboard", existing: null, versionExists: false }),
    ).toBeNull();
    expect(
      publishConflict({
        ...base,
        type: "widget",
        existing: { type: "widget", latestVersion: "1.0.0" },
        versionExists: false,
      }),
    ).toBeNull();
  });

  it("refuses to replace a version that's already published", () => {
    const msg = publishConflict({
      ...base,
      type: "widget",
      existing: { type: "widget", latestVersion: "1.0.1" },
      versionExists: true,
    });
    expect(msg).toMatch(/1\.0\.1 of "trops\/weather" is already published/);
    expect(msg).toMatch(/the latest is 1\.0\.1/);
  });

  it("refuses to change a package's kind (a missing type is a widget)", () => {
    expect(
      publishConflict({
        ...base,
        type: "dashboard",
        existing: { type: null, latestVersion: "1.0.0" },
        versionExists: false,
      }),
    ).toMatch(/already a widget package — a dashboard can't/);
    expect(
      publishConflict({
        ...base,
        type: undefined,
        existing: { type: "widget" },
        versionExists: false,
      }),
    ).toBeNull();
  });
});
