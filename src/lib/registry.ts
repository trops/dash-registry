/**
 * Registry data types. The actual data lives in DynamoDB and is loaded
 * via the `/api/packages` endpoints. This file is intentionally types-
 * only — the static `registry-index.json` fallback was removed once all
 * packages were migrated to DynamoDB.
 */

/** A check package's summary (DASH-106): what the card and page show. */
export interface CheckSummary {
  kind: "file" | "tool";
  inputs?: Array<{ name: string; label?: string }>;
  needs?: { commands?: string[]; provider?: string };
}

export interface WidgetProvider {
  type: string;
  required: boolean;
}

export interface Widget {
  name: string;
  displayName?: string;
  description?: string;
  icon?: string;
  id?: string;
  package?: string;
  version?: string;
  required?: boolean;
  author?: string;
  providers?: WidgetProvider[];
}

export interface TeamSummary {
  members: Array<{ role: string; name: string }>;
  wiring?: Array<{ role: string; on: { role: string; event: string } }>;
}

/**
 * flow packages (flows PRD, phase 7): the steps a piece of work goes
 * through — who does each, which are checks with no AI, where you come in.
 * The zip carries the flow itself, its bots and its files.
 */
export interface FlowSummary {
  name: string;
  steps: Array<{ key: string; kind: string; name: string }>;
  bots?: number;
  checks?: number;
  files?: string[];
  needs?: { providers?: string[]; folder?: boolean };
}

/** A flow a dashboard needs, by version range ("@trops/ticket-to-pr", "^1.2"). */
export interface FlowDependency {
  package: string;
  version: string;
}

export interface Package {
  scope?: string;
  githubUser?: string;
  name: string;
  displayName: string;
  author: string;
  description: string;
  version: string;
  category: string;
  tags: string[];
  downloadUrl: string;
  repository?: string;
  publishedAt: string;
  widgets: Widget[];
  providerTypes?: string[];
  deprecated?: boolean;
  deprecatedMessage?: string;
  type?: string;
  appOrigin?: string;
  latestVersion?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    tertiary?: string;
  };
  /** bot-team packages: who's on the team and how they're wired. */
  team?: TeamSummary;
  /** bot packages: the bot's display summary. */
  bot?: { name: string };
  /** flow packages: the flow's steps, bots, checks and files. */
  flow?: FlowSummary;
  /** dashboards: the flows they need, by version range. */
  flows?: FlowDependency[];
  /** check packages (DASH-106): the check's kind, inputs and needs. */
  check?: CheckSummary;
  /** teams (DASH-106): the check packages its checks use ("@scope/name"). */
  checkPackages?: string[];
  theme?: {
    key?: string;
    name?: string;
    registryPackage?: string;
    colors?: {
      primary?: string;
      secondary?: string;
      tertiary?: string;
    };
  };
}

export interface RegistryIndex {
  version: string;
  lastUpdated: string;
  packages: Package[];
}
