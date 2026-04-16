# Contributing to Dash Registry

Thanks for your interest in publishing a package to the Dash Registry!

There are two contribution paths:

1. **Publishing a package** (most contributors) — done through the Dash desktop app, no PR to this repo required. See below.
2. **Contributing to the registry codebase** (Next.js app, API routes, UI) — open a PR against `main`. See [README.md](README.md) for development setup.

## Publishing a Package

Packages live in DynamoDB + S3. The Dash desktop app handles the publish flow end-to-end.

### Prerequisites

- A registry account (created automatically the first time you sign in via the Dash app)
- A Dash widget, dashboard, or theme installed locally that you authored

### Publish Flow

1. **Open the Dash app** → Settings
2. **Pick what to publish:**
   - **Widgets** → Settings → Widgets → select the widget → click `Publish…`
   - **Dashboards** → Settings → Dashboards → select the dashboard → click `Publish…` (the publish flow walks you through dependencies — owned widgets + theme can be published in the same pass)
   - **Themes** → Settings → Themes → select the theme → click `Publish…`
3. **Sign in** to the registry if you haven't already (Dash uses Cognito Hosted UI)
4. **Pick visibility:** `public` (anyone can install) or `private` (only you + people you grant access)
5. **Click Publish.** The app generates a manifest, zips the package source, and POSTs to `/api/publish`.

The package is immediately discoverable on the registry website and in other Dash users' Discover tab (assuming compatible visibility/entitlements).

### What Gets Stored

| Where | What |
|---|---|
| `Package` table | Latest metadata: scope, name, displayName, description, type, category, tags, latestVersion, ownerId, visibility |
| `PackageVersion` table | One row per published version: full manifest snapshot + downloadUrl + appOrigin |
| `Entitlement` table | An "owner" entitlement for the publisher (auto-created); plus any explicit grants you make later |
| S3 bucket | The zipped package source — public packages get a long-lived URL, private get pre-signed 60-second URLs |

## Manifest Schema

The Dash app generates the manifest for you, but if you're integrating with `/api/publish` directly, here's what the validator (`src/lib/validate.ts`) accepts.

### Required Fields

| Field | Type | Rules |
|---|---|---|
| `scope` | `string` | Your registry username (lowercase). Must match the authenticated user's scope — the publish endpoint enforces this. |
| `name` | `string` | Kebab-case, 2–50 chars |
| `displayName` | `string` | Non-empty, max 100 chars |
| `version` | `string` | Valid semver (e.g., `1.0.0`, `2.1.0-beta`) |
| `appOrigin` | `string` | The Dash app identifier (e.g., `@trops/dash-electron`) — used for compatibility filtering in Discover |
| `widgets` | `array` | For widget + dashboard packages: non-empty array of widget objects (see below). Theme packages skip this. |
| `colors` | `object` | For theme packages only: must include `primary`, `secondary`, `tertiary` |

### Optional Fields

| Field | Type | Rules |
|---|---|---|
| `type` | `string` | `widget` (default), `dashboard`, or `theme` |
| `visibility` | `string` | `public` (default) or `private` |
| `author` | `string` | Max 100 chars — defaults to your registry display name |
| `description` | `string` | Max 500 chars |
| `category` | `string` | One of: `general`, `utilities`, `productivity`, `development`, `social`, `media`, `finance`, `health`, `education`, `other` |
| `tags` | `string[]` | Max 10 items, each lowercase, max 30 chars |
| `icon` | `string` | FontAwesome icon name |
| `providers` | `array` | Aggregate providers required across the package |
| `repository` | `string` | HTTPS URL |
| `theme` | `object` | For dashboard packages bundling a theme |

### Widget Object (inside `widgets[]`)

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | `string` | Yes | PascalCase (e.g., `CurrentWeather`) |
| `displayName` | `string` | Yes | Non-empty |
| `description` | `string` | Yes | Non-empty |
| `icon` | `string` | No | Icon identifier |
| `providers` | `array` | No | Array of `{ type, required, providerClass }` |

### Naming Rules

- **Scope**: your registry username, lowercase. Always rewritten to your authenticated scope at publish time — local conventions like `@ai-built/…` are remapped to your scope automatically.
- **Package name**: kebab-case (`my-cool-widgets`), 2–50 characters
- **Widget name**: PascalCase (`MyCoolWidget`)
- No duplicate widget names within a package

## Updating a Package

Just publish again from the Dash app — the publish modal lets you bump the version (patch/minor/major) and writes a new `PackageVersion` row. The `Package.latestVersion` is updated atomically. Old versions stay available in `PackageVersion`.

## Visibility & Access Management

- **Public** packages are visible and installable by anyone.
- **Private** packages are visible only to:
  - The owner (you), via an auto-created owner entitlement
  - Users you've granted access via the Access Management page on the registry website (`/package/{scope}/{name}/access`)
  - Org members (when you grant access to an org)
  - Users whose verified email matches a domain you've verified for an org

## Deprecation / Removal

Currently:

- **Soft deprecation:** flag in DynamoDB (planned UI). For now, set the package to private to hide it from public discovery.
- **Hard removal:** contact a maintainer or use the registry website's package page (delete button — owner only).

## Contributing to the Registry Codebase

Bug fixes, new features, UI improvements? Open a PR.

1. Fork or branch from `main`
2. `npm install` and `npm run dev`
3. Make changes
4. `npm run check` (lint + test + build)
5. Open a PR

See [README.md](README.md) and [CLAUDE.md](CLAUDE.md) for project structure, scripts, and the local CI workflow.
