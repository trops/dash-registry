import { describe, it, expect } from "vitest";
import { createSearchIndex, searchPackages } from "./search";
import type { Package } from "./registry";

const pkg = (over: Partial<Package>): Package => ({
  name: "x",
  displayName: "X",
  author: "trops",
  description: "",
  version: "1.0.0",
  category: "general",
  tags: [],
  downloadUrl: "",
  publishedAt: "",
  widgets: [],
  ...over,
});

const packages = [
  pkg({
    name: "daily-brief",
    displayName: "Morning Team",
    type: "bot-team",
    providerTypes: ["google-calendar", "gmail", "filesystem"],
    team: {
      members: [
        { role: "agenda", name: "Agenda Reader" },
        { role: "inbox", name: "Inbox Triage" },
      ],
    },
  }),
  pkg({
    name: "summariser",
    displayName: "Summariser",
    type: "bot",
    providerTypes: ["slack"],
    bot: { name: "Channel Digest" },
  }),
  pkg({ name: "weather", displayName: "Weather Widget" }),
];

describe("searchPackages — bots and teams", () => {
  const fuse = createSearchIndex(packages);
  const names = (q: string) =>
    searchPackages(fuse, q, packages).map((p) => p.name);

  it("finds a team by one of its members", () => {
    expect(names("Inbox Triage")).toContain("daily-brief");
  });

  it("finds a bot by its bot name", () => {
    expect(names("Channel Digest")).toContain("summariser");
  });

  it("finds bots and teams by the providers they use", () => {
    expect(names("gmail")).toContain("daily-brief");
    expect(names("slack")).toContain("summariser");
  });
});
