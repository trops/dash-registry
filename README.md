# Dash Registry

Package registry and marketplace for the [Dash](https://github.com/trops/dash-electron) Electron dashboard app. Browse, discover, and install community-built widgets, dashboards, and themes.

**Live site:** [main.d919rwhuzp7rj.amplifyapp.com](https://main.d919rwhuzp7rj.amplifyapp.com) — deployed on AWS Amplify on push to `main`.

## Architecture

| Layer | Tech |
|---|---|
| Web app | Next.js 14 (App Router, server-rendered) |
| UI | React 18, Tailwind CSS, Fuse.js (client-side search) |
| Auth | AWS Cognito (Hosted UI + JWT verification) |
| Data | DynamoDB (`Package`, `PackageVersion`, `Entitlement`, `User`, `Org`, `OrgMember`, `OrgDomain`, `InstallLog`) |
| Storage | S3 (zipped package contents, served via pre-signed URLs for private packages) |
| Backend | Amplify Gen 2 (`amplify/backend.ts` provisions Cognito + DynamoDB + S3) |
| Hosting | AWS Amplify (Next.js SSR app) |

DynamoDB is the **single source of truth** for packages. The legacy static `packages/{scope}/{name}/manifest.json` mechanism was removed in v1.5.9 — all reads now go through `/api/packages*` endpoints.

## Local Development

```bash
npm install
cp .env.local.example .env.local   # set Cognito + DynamoDB env vars
npm run dev                          # http://localhost:3001
```

Dev mode talks to the deployed Amplify backend by default. Override `DASH_REGISTRY_API_URL` to point at a local instance.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js dev server on port 3001 |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | ESLint via `next lint` |
| `npm run test` | Vitest unit tests |
| `npm run check` | Lint + test + build (run before committing) |
| `npm run create-project -- <name> [WidgetName]` | Scaffold a new widget package locally from the Dash template |
| `npm run ci` / `ci:commit` / `ci:push` / `ci:pr` / `ci:release` | The local CI script — see `scripts/ci.sh` |

## Project Structure

```
amplify/                          # Amplify Gen 2 backend (Cognito, DynamoDB, S3)
docs/
  AMPLIFY_BACKEND.md              # Backend architecture deep-dive
scripts/
  ci.sh                           # Local validation + release pipeline
  create-project.js               # Scaffold a new widget project
  smoke-test-private-packages.js  # Manual smoke test for private package flow
src/
  app/                            # Next.js App Router pages + API routes
    api/
      packages/                   # List + detail + resolve + download
      publish/                    # POST: publish a package (auth required)
      auth/                       # Sign in, profile, owned packages
      orgs/                       # Org management + member grants
      ...
    account/                      # User dashboard (owned packages, entitlements)
    package/[scope]/[name]/       # Public package detail page
  components/                     # React components (PackageCard, SearchBar, etc.)
  lib/
    db.ts                         # DynamoDB client + table helpers
    s3.ts                         # S3 client + presigned URLs
    auth.ts                       # JWT verification (Cognito)
    entitlement.ts                # Private-package entitlement logic
    registry.ts                   # Type definitions (Package, Widget, etc.)
```

## Publishing a Package

Packages are published **from the Dash desktop app**, not via PR to this repo:

1. In Dash: Settings → Widgets / Dashboards / Themes → select a package → click **Publish…**
2. The app:
   - Generates a manifest (scoped to your registry username)
   - Zips the package source
   - Posts to `/api/publish` with auth
3. The endpoint:
   - Validates the manifest
   - Uploads the ZIP to S3
   - Writes Package + PackageVersion rows to DynamoDB
   - Auto-grants the publisher an owner entitlement
4. The package is immediately discoverable via `/api/packages` and the website's homepage.

For the full publish flow + manifest schema, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Backend Architecture

For a deep-dive on Cognito + DynamoDB + S3 wiring, IAM policies, the entitlement model, and the install-log audit trail, see [`docs/AMPLIFY_BACKEND.md`](docs/AMPLIFY_BACKEND.md).

## License

[MIT](LICENSE)
