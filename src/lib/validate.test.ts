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
    {
      role: "writer",
      on: { role: "inbox", event: "tool.gmail.search_emails" },
    },
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

describe("validateManifest — dashboards with bots (US-027)", () => {
  const dashboard = {
    ...base,
    type: "dashboard",
    widgets: [
      {
        package: "@trops/ask",
        scope: "trops",
        packageName: "ask",
        widgetName: "Ask",
      },
    ],
  };
  it("a dashboard may carry its bots' summary, checked like a team", () => {
    expect(validateManifest({ ...dashboard, team }).valid).toBe(true);
    expect(validateManifest(dashboard).valid).toBe(true);
    const bad = validateManifest({ ...dashboard, team: { members: [] } });
    expect(bad.valid).toBe(false);
  });
  it("wiring may be on another bot's result", () => {
    const withResult = {
      members: team.members,
      wiring: [
        { role: "writer", on: { role: "inbox", event: "result.digest" } },
      ],
    };
    expect(validateManifest({ ...dashboard, team: withResult }).valid).toBe(
      true,
    );
    expect(
      validateManifest({ ...base, type: "bot-team", team: withResult }).valid,
    ).toBe(true);
    const badName = {
      members: team.members,
      wiring: [{ role: "writer", on: { role: "inbox", event: "result.1x" } }],
    };
    expect(validateManifest({ ...dashboard, team: badName }).valid).toBe(false);
  });
});

describe("validateManifest — flow packages", () => {
  const flow = {
    name: "Ticket to PR",
    steps: [
      { key: "reader", kind: "source", name: "Ticket reader" },
      { key: "builder", kind: "bot", name: "Builder" },
      { key: "ci", kind: "check", name: "GitHub CI" },
      { key: "you", kind: "you", name: "You" },
    ],
    bots: 2,
    files: ["scripts/check-pr.js", "data/protected-paths.txt"],
  };

  it("accepts a flow with its steps and files, and no widgets", () => {
    const r = validateManifest({
      ...base,
      name: "ticket-to-pr",
      type: "flow",
      flow,
    });
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("requires steps of known kinds with unique keys", () => {
    expect(validateManifest({ ...base, type: "flow" }).valid).toBe(false);
    const bad = validateManifest({
      ...base,
      type: "flow",
      flow: {
        ...flow,
        steps: [
          { key: "a", kind: "robot", name: "A" },
          { key: "a", kind: "bot", name: "B" },
        ],
      },
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(" ")).toMatch(/kind must be one of/);
    expect(bad.errors.join(" ")).toMatch(/duplicate/);
  });

  it("files only in scripts/, checks/ or data/", () => {
    const r = validateManifest({
      ...base,
      type: "flow",
      flow: { ...flow, files: ["../secrets.txt"] },
    });
    expect(r.valid).toBe(false);
  });

  it("a dashboard lists the flows it needs by version range", () => {
    const dash = {
      ...base,
      type: "dashboard",
      widgets: [
        {
          package: "@trops/notes",
          scope: "trops",
          packageName: "notes",
          widgetName: "Notes",
        },
      ],
    };
    expect(
      validateManifest({
        ...dash,
        flows: [{ package: "@trops/ticket-to-pr", version: "^1.2" }],
      }).valid,
    ).toBe(true);
    const bad = validateManifest({
      ...dash,
      flows: [{ package: "ticket-to-pr", version: "latest!" }],
    });
    expect(bad.valid).toBe(false);
  });
});

describe("validateManifest — check packages (DASH-106)", () => {
  it("accepts a file check and a tool check, with no widgets", () => {
    expect(
      validateManifest({
        ...base,
        type: "check",
        check: {
          kind: "file",
          inputs: [{ name: "sections", label: "Sections" }],
          needs: { commands: ["node"] },
        },
      }).valid,
    ).toBe(true);
    expect(
      validateManifest({
        ...base,
        type: "check",
        check: { kind: "tool", needs: { provider: "jira" } },
      }).valid,
    ).toBe(true);
  });

  it("refuses a check with no kind, a bad input, or a tool with no provider", () => {
    const errs = (check: unknown) =>
      validateManifest({ ...base, type: "check", check } as never).errors.join(
        " ",
      );
    expect(errs(undefined)).toMatch(/check\.kind/);
    expect(errs({ kind: "file", inputs: [{ name: "1bad" }] })).toMatch(
      /check\.inputs\[0\]\.name/,
    );
    expect(errs({ kind: "tool" })).toMatch(/check\.needs\.provider/);
  });

  it("a team lists its check packages as @scope/name", () => {
    const ok = validateManifest({
      ...base,
      type: "bot-team",
      team,
      checkPackages: ["@trops/plan-lint"],
    });
    expect(ok.valid).toBe(true);
    const bad = validateManifest({
      ...base,
      type: "bot-team",
      team,
      checkPackages: ["plan-lint"],
    });
    expect(bad.errors.join(" ")).toMatch(/checkPackages/);
  });
});
