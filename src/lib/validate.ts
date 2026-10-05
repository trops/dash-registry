/**
 * Manifest validation for API-submitted packages.
 *
 * Reuses the same validation rules as scripts/validate-packages.js
 * but adapted for runtime use in API routes.
 */

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+)?$/;
const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]+$/;

import { VALID_TAGS } from "@/lib/tags";

const VALID_CATEGORIES = [
  "general",
  "utilities",
  "productivity",
  "development",
  "social",
  "media",
  "finance",
  "health",
  "education",
  "other",
];

interface Widget {
  name?: string;
  displayName?: string;
  description?: string;
  icon?: string;
  id?: string;
  scope?: string;
  packageName?: string;
  widgetName?: string;
  package?: string;
  version?: string;
  required?: boolean;
  author?: string;
  providers?: Array<{ type?: string; required?: boolean }>;
}

interface ThemeColors {
  primary?: string;
  secondary?: string;
  tertiary?: string;
  neutral?: string;
}

interface Manifest {
  scope?: string;
  githubUser?: string;
  name?: string;
  displayName?: string;
  version?: string;
  downloadUrl?: string;
  widgets?: Widget[];
  author?: string;
  description?: string;
  category?: string;
  tags?: string[];
  providerTypes?: unknown[];
  repository?: string;
  type?: string;
  icon?: string;
  appOrigin?: string;
  colors?: ThemeColors;
  // bot-team packages: a display summary of the .team.json in the zip.
  team?: unknown;
  // bot packages: a display summary of the bot.json in the zip.
  bot?: unknown;
}

// Bots and teams (bot-teams TEAM-006, bot-factory US-026). The zip carries
// the real definition, which the app re-validates at install; these checks
// cover the summary the registry stores and shows.
const TEAM_ROLE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TEAM_EVENT = /^(completed|failed|tool\.[A-Za-z0-9_.:-]{1,200})$/;
const MAX_TEAM_MEMBERS = 20;
const MAX_TEAM_WIRING = 100;
const MAX_BOT_NAME = 100;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function validBotName(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0 && v.length <= MAX_BOT_NAME;
}

function validateTeamSummary(team: unknown, errors: string[]): void {
  if (!isRecord(team) || !Array.isArray(team.members)) {
    errors.push('Team packages require "team.members"');
    return;
  }
  const members = team.members as unknown[];
  if (members.length === 0 || members.length > MAX_TEAM_MEMBERS) {
    errors.push(`"team.members" must list 1-${MAX_TEAM_MEMBERS} bots`);
    return;
  }
  const roles = new Set<string>();
  members.forEach((m, i) => {
    const prefix = `team.members[${i}]`;
    if (!isRecord(m) || typeof m.role !== "string" || !TEAM_ROLE.test(m.role)) {
      errors.push(`${prefix}.role must be lowercase letters, digits or dashes`);
      return;
    }
    if (roles.has(m.role)) errors.push(`${prefix}.role "${m.role}" is a duplicate`);
    roles.add(m.role);
    if (!validBotName(m.name)) {
      errors.push(`${prefix}.name is required (at most ${MAX_BOT_NAME} characters)`);
    }
  });
  if (team.wiring === undefined) return;
  if (!Array.isArray(team.wiring) || team.wiring.length > MAX_TEAM_WIRING) {
    errors.push(`"team.wiring" must be a list of at most ${MAX_TEAM_WIRING} links`);
    return;
  }
  (team.wiring as unknown[]).forEach((w, i) => {
    const prefix = `team.wiring[${i}]`;
    const on = isRecord(w) ? w.on : null;
    if (
      !isRecord(w) ||
      !isRecord(on) ||
      typeof w.role !== "string" ||
      typeof on.role !== "string" ||
      !roles.has(w.role) ||
      !roles.has(on.role)
    ) {
      errors.push(`${prefix} must connect two of the team's roles`);
      return;
    }
    if (w.role === on.role) {
      errors.push(`${prefix}: a bot can't trigger itself`);
      return;
    }
    if (typeof on.event !== "string" || !TEAM_EVENT.test(on.event)) {
      errors.push(`${prefix}.on.event is not a known event`);
    }
  });
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateManifest(manifest: Manifest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // scope or githubUser
  const scope = manifest.scope || manifest.githubUser;
  if (!scope) {
    errors.push('"scope" or "githubUser" is required');
  } else if (typeof scope !== "string") {
    errors.push('"scope" must be a string');
  }

  // name
  if (!manifest.name) {
    errors.push('"name" is required');
  } else if (!KEBAB_CASE.test(manifest.name)) {
    errors.push(`"name" must be kebab-case (got "${manifest.name}")`);
  } else if (manifest.name.length < 2 || manifest.name.length > 50) {
    errors.push('"name" must be 2-50 characters');
  }

  // displayName
  if (!manifest.displayName) {
    errors.push('"displayName" is required');
  } else if (manifest.displayName.length > 100) {
    errors.push('"displayName" must be at most 100 characters');
  }

  // version
  if (!manifest.version) {
    errors.push('"version" is required');
  } else if (!SEMVER.test(manifest.version)) {
    errors.push(`"version" must be valid semver (got "${manifest.version}")`);
  }

  // widgets — themes, bots and teams skip widget validation entirely
  if (manifest.type === "bot-team") {
    validateTeamSummary(manifest.team, errors);
  } else if (manifest.type === "bot") {
    if (!isRecord(manifest.bot) || !validBotName(manifest.bot.name)) {
      errors.push(
        `Bot packages require "bot.name" (at most ${MAX_BOT_NAME} characters)`,
      );
    }
  } else if (manifest.type === "theme") {
    // Theme packages require colors instead of widgets
    if (
      !manifest.colors ||
      !manifest.colors.primary ||
      !manifest.colors.secondary ||
      !manifest.colors.tertiary
    ) {
      errors.push(
        "Theme packages require colors.primary, colors.secondary, colors.tertiary",
      );
    }
  } else if (!manifest.widgets || !Array.isArray(manifest.widgets)) {
    errors.push('"widgets" must be a non-empty array');
  } else if (manifest.widgets.length === 0) {
    errors.push('"widgets" must be a non-empty array');
  } else if (manifest.type === "dashboard") {
    // Dashboard widgets are dependency references, not widget definitions
    const seenPackages = new Set<string>();
    manifest.widgets.forEach((widget, i) => {
      const prefix = `widgets[${i}]`;
      if (!widget.package || typeof widget.package !== "string") {
        errors.push(`${prefix}.package is required`);
      } else if (seenPackages.has(widget.package)) {
        warnings.push(
          `${prefix}.package "${widget.package}" is a duplicate dependency`,
        );
      } else {
        seenPackages.add(widget.package);
      }

      // Scope enforcement warnings (will become errors in a future release)
      if (!widget.scope) {
        warnings.push(
          `${prefix}.scope is missing — scoped widget IDs will be required in a future release`,
        );
      }
      if (!widget.packageName) {
        warnings.push(
          `${prefix}.packageName is missing — scoped widget IDs will be required in a future release`,
        );
      }
      if (!widget.widgetName) {
        warnings.push(
          `${prefix}.widgetName is missing — scoped widget IDs will be required in a future release`,
        );
      }
    });
  } else {
    // Widget package validation (existing behavior)
    const widgetNames = new Set<string>();
    manifest.widgets.forEach((widget, i) => {
      const prefix = `widgets[${i}]`;
      if (!widget.name) {
        errors.push(`${prefix}.name is required`);
      } else if (!PASCAL_CASE.test(widget.name)) {
        errors.push(`${prefix}.name must be PascalCase (got "${widget.name}")`);
      } else if (widgetNames.has(widget.name)) {
        errors.push(`${prefix}.name "${widget.name}" is a duplicate`);
      } else {
        widgetNames.add(widget.name);
      }

      if (!widget.displayName) {
        errors.push(`${prefix}.displayName is required`);
      }
      if (!widget.description) {
        errors.push(`${prefix}.description is required`);
      }

      // Scope enforcement warnings (will become errors in a future release)
      if (!widget.scope) {
        warnings.push(
          `${prefix}.scope is missing — scoped widget IDs will be required in a future release`,
        );
      }
      if (!widget.packageName) {
        warnings.push(
          `${prefix}.packageName is missing — scoped widget IDs will be required in a future release`,
        );
      }
      if (!widget.widgetName) {
        warnings.push(
          `${prefix}.widgetName is missing — scoped widget IDs will be required in a future release`,
        );
      }
    });
  }

  // appOrigin (required)
  if (!manifest.appOrigin) {
    errors.push('"appOrigin" is required');
  } else if (typeof manifest.appOrigin !== "string") {
    errors.push('"appOrigin" must be a string');
  } else if (manifest.appOrigin.length > 200) {
    errors.push('"appOrigin" must be at most 200 characters');
  }

  // Optional fields
  if (manifest.category && !VALID_CATEGORIES.includes(manifest.category)) {
    warnings.push(`"category" not recognized (got "${manifest.category}")`);
  }

  if (manifest.providerTypes) {
    if (!Array.isArray(manifest.providerTypes)) {
      warnings.push('"providerTypes" must be an array of strings');
    } else {
      const invalid = manifest.providerTypes.filter(
        (t) => typeof t !== "string",
      );
      if (invalid.length > 0) {
        warnings.push('"providerTypes" entries must be strings');
      }
    }
  }

  if (manifest.tags) {
    if (manifest.tags.length > 10) {
      warnings.push('"tags" should have at most 10 items');
    }
    const invalidTags = manifest.tags.filter((t) => !VALID_TAGS.includes(t));
    if (invalidTags.length > 0) {
      warnings.push(
        `Unrecognized tags: ${invalidTags.join(", ")}. Valid tags: ${VALID_TAGS.join(", ")}`,
      );
    }
  }

  if (manifest.author && manifest.author.length > 100) {
    warnings.push('"author" should be at most 100 characters');
  }

  if (manifest.description && manifest.description.length > 500) {
    warnings.push('"description" should be at most 500 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
