/**
 * Package types as the registry shows them: filter options, labels, the
 * card's count line, and team wiring as a sentence. Bots and teams
 * (bot-factory US-026, bot-teams TEAM-006) sit beside widgets, dashboards
 * and themes.
 */
import type { TeamSummary } from "@/lib/registry";

export const TYPE_FILTERS: Array<{ label: string; value: string | null }> = [
  { label: "All", value: null },
  { label: "Widgets", value: "widget" },
  { label: "Dashboards", value: "dashboard" },
  { label: "Themes", value: "theme" },
  { label: "Bots", value: "bot" },
  { label: "Teams", value: "bot-team" },
];

const TYPE_LABELS: Record<string, string> = {
  widget: "Widget",
  dashboard: "Dashboard",
  theme: "Theme",
  bot: "Bot",
  "bot-team": "Team",
};

export function typeLabel(type?: string): string {
  return TYPE_LABELS[type || "widget"] || "Widget";
}

interface CountablePackage {
  type?: string;
  widgets?: unknown[];
  providerTypes?: string[];
  team?: TeamSummary;
}

/** The card's count line: "3 bots", "uses gmail", "2 widgets", … */
export function countLabel(pkg: CountablePackage): string {
  const type = pkg.type || "widget";
  if (type === "theme") return "";
  if (type === "bot-team") {
    const n = (pkg.team?.members || []).length;
    return `${n} bot${n !== 1 ? "s" : ""}`;
  }
  if (type === "bot") {
    const types = pkg.providerTypes || [];
    return types.length ? `uses ${types.join(", ")}` : "";
  }
  const n = (pkg.widgets || []).length;
  if (type === "dashboard") return `${n} widget dep${n !== 1 ? "s" : ""}`;
  return `${n} widget${n !== 1 ? "s" : ""}`;
}

/** "Agenda completes → Inbox runs" */
export function wiringText(
  w: { role: string; on: { role: string; event: string } },
  names: Record<string, string>,
): string {
  const from = names[w.on.role] || w.on.role;
  const to = names[w.role] || w.role;
  const ev = w.on.event;
  const what =
    ev === "completed"
      ? "completes"
      : ev === "failed"
        ? "fails"
        : `uses ${ev.replace(/^tool\./, "").replace(".", " ")}`;
  return `${from} ${what} → ${to} runs`;
}
