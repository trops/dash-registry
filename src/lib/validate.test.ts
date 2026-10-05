import { describe, it, expect } from "vitest";
import { validateManifest } from "./validate";

const base = {
  scope: "trops",
  name: "daily-brief",
  displayName: "Daily Brief",
  version: "1.0.0",
  appOrigin: "@trops/dash-electron",
};

const team = {
  members: [
    { role: "agenda", name: "Agenda" },
    { role: "inbox", name: "Inbox" },
    { role: "writer", name: "Writer" },
  ],
  wiring: [
    { role: "inbox", on: { role: "agenda", event: "completed" } },
    { role: "writer", on: { role: "inbox", event: "tool.gmail.search_emails" } },
  ],
};

describe("validateManifest — bot-team packages", () => {
  it("accepts a team with members and wiring, and no widgets", () => {
    const r = validateManifest({
      ...base,
      type: "bot-team",
      providerTypes: ["google-calendar", "gmail", "filesystem"],
      team,
    });
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("accepts a team without wiring", () => {
    const r = validateManifest({
      ...base,
      type: "bot-team",
      team: { members: team.members },
    });
    expect(r.valid).toBe(true);
  });

  it("requires a team summary with 1–20 members", () => {
    expect(validateManifest({ ...base, type: "bot-team" }).valid).toBe(false);
    expect(
      validateManifest({ ...base, type: "bot-team", team: { members: [] } })
        .valid,
    ).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => ({
      role: `bot-${i}`,
      name: `Bot ${i}`,
    }));
    expect(
      validateManifest({ ...base, type: "bot-team", team: { members: many } })
        .valid,
    ).toBe(false);
  });

  it("rejects bad or duplicate roles and missing or long names", () => {
    const bad = (members: unknown[]) =>
      validateManifest({ ...base, type: "bot-team", team: { members } }).valid;
    expect(bad([{ role: "Has Spaces", name: "X" }])).toBe(false);
    expect(
      bad([
        { role: "a", name: "A" },
        { role: "a", name: "B" },
      ]),
    ).toBe(false);
    expect(bad([{ role: "a", name: "" }])).toBe(false);
    expect(bad([{ role: "a", name: "x".repeat(101) }])).toBe(false);
  });

  it("rejects wiring to unknown roles, self-triggers and unknown events", () => {
    const wired = (wiring: unknown[]) =>
      validateManifest({
        ...base,
        type: "bot-team",
        team: { members: team.members, wiring },
      }).valid;
    expect(
      wired([{ role: "inbox", on: { role: "ghost", event: "completed" } }]),
    ).toBe(false);
    expect(
      wired([{ role: "inbox", on: { role: "inbox", event: "completed" } }]),
    ).toBe(false);
    expect(
      wired([{ role: "inbox", on: { role: "agenda", event: "whenever" } }]),
    ).toBe(false);
    expect(wired([{ role: "inbox" }])).toBe(false);
  });
});

describe("validateManifest — bot packages", () => {
  it("accepts a single bot with no widgets", () => {
    const r = validateManifest({
      ...base,
      name: "inbox-summary",
      displayName: "Inbox Summary",
      type: "bot",
      providerTypes: ["gmail"],
      bot: { name: "Inbox" },
    });
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("requires a bot summary with a name", () => {
    expect(validateManifest({ ...base, type: "bot" }).valid).toBe(false);
    expect(
      validateManifest({ ...base, type: "bot", bot: { name: "" } }).valid,
    ).toBe(false);
    expect(
      validateManifest({ ...base, type: "bot", bot: { name: "x".repeat(101) } })
        .valid,
    ).toBe(false);
  });
});

describe("validateManifest — existing types unchanged", () => {
  it("still requires widgets for widget packages", () => {
    const r = validateManifest({ ...base });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('"widgets" must be a non-empty array');
  });

  it("still requires colors (not widgets) for themes", () => {
    expect(validateManifest({ ...base, type: "theme" }).valid).toBe(false);
    expect(
      validateManifest({
        ...base,
        type: "theme",
        colors: { primary: "blue", secondary: "gray", tertiary: "green" },
      }).valid,
    ).toBe(true);
  });

  it("still needs scope, name, displayName, version and appOrigin", () => {
    const r = validateManifest({ type: "bot", bot: { name: "Inbox" } });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(5);
  });
});
