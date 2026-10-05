import { describe, it, expect } from "vitest";
import {
  TYPE_FILTERS,
  typeLabel,
  countLabel,
  wiringText,
} from "./packageTypes";

describe("package types", () => {
  it("offers Bots and Teams filters alongside the existing ones", () => {
    expect(TYPE_FILTERS.map((f) => f.label)).toEqual([
      "All",
      "Widgets",
      "Dashboards",
      "Themes",
      "Bots",
      "Teams",
    ]);
    expect(TYPE_FILTERS.find((f) => f.label === "Teams")?.value).toBe(
      "bot-team",
    );
    expect(TYPE_FILTERS.find((f) => f.label === "Bots")?.value).toBe("bot");
  });

  it("labels each type, defaulting to Widget", () => {
    expect(typeLabel("bot")).toBe("Bot");
    expect(typeLabel("bot-team")).toBe("Team");
    expect(typeLabel("theme")).toBe("Theme");
    expect(typeLabel(undefined)).toBe("Widget");
  });

  it("counts what a package holds", () => {
    expect(
      countLabel({
        type: "bot-team",
        widgets: [],
        team: { members: [{ role: "a", name: "A" }, { role: "b", name: "B" }] },
      }),
    ).toBe("2 bots");
    expect(
      countLabel({
        type: "bot-team",
        widgets: [],
        team: { members: [{ role: "a", name: "A" }] },
      }),
    ).toBe("1 bot");
    expect(countLabel({ type: "bot", widgets: [], providerTypes: ["gmail"] })).toBe(
      "uses gmail",
    );
    expect(countLabel({ type: "bot", widgets: [] })).toBe("");
    expect(countLabel({ type: "theme", widgets: [] })).toBe("");
    expect(countLabel({ type: "dashboard", widgets: [{ name: "a" }] })).toBe(
      "1 widget dep",
    );
    expect(countLabel({ widgets: [{ name: "a" }, { name: "b" }] })).toBe(
      "2 widgets",
    );
  });

  it("reads team wiring as a sentence", () => {
    const names = { agenda: "Agenda", inbox: "Inbox" };
    expect(
      wiringText({ role: "inbox", on: { role: "agenda", event: "completed" } }, names),
    ).toBe("Agenda completes → Inbox runs");
    expect(
      wiringText({ role: "inbox", on: { role: "agenda", event: "failed" } }, names),
    ).toBe("Agenda fails → Inbox runs");
    expect(
      wiringText(
        { role: "inbox", on: { role: "agenda", event: "tool.gmail.search_emails" } },
        names,
      ),
    ).toBe("Agenda uses gmail search_emails → Inbox runs");
  });
});
