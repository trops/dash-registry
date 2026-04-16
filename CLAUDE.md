# dash-registry

Package registry and marketplace for Dash. Built with Next.js 14, React 18, TypeScript, Tailwind CSS, and an Amplify-backed AWS stack (Cognito + DynamoDB + S3).

**Live site:** https://main.d919rwhuzp7rj.amplifyapp.com

## Project Structure

- `amplify/` — Amplify Gen 2 backend (Cognito User Pool, DynamoDB tables, S3 bucket)
- `scripts/`
  - `ci.sh` — Local validation + release pipeline
  - `create-project.js` — Scaffold a new widget project from the Dash template
  - `smoke-test-private-packages.js` — Manual smoke test for private package flow
- `src/`
  - `app/` — Next.js App Router pages + API routes
  - `components/` — React components
  - `lib/` — DB, S3, auth, entitlement helpers + shared types
- `docs/AMPLIFY_BACKEND.md` — Backend architecture deep-dive

DynamoDB is the single source of truth for packages. The legacy static `packages/{scope}/{name}/manifest.json` mechanism was removed in v1.5.9.

## Local CI Script (Recommended)

The `scripts/ci.sh` script handles the full validation pipeline (Node 20 via nvm, ESLint, Vitest, Next.js build) and optionally the git workflow:

```bash
# Validate only
npm run ci

# Validate + commit + version bump
npm run ci:commit -- -m "Your commit message"

# Above + push branch
npm run ci:push -- -m "Your commit message"

# Above + create PR
npm run ci:pr -- -m "Your commit message"

# Above + merge PR + tag + cleanup branches
npm run ci:release -- -m "Your commit message"
```

Each flag is cumulative — `--release` runs all prior steps. The script automatically switches to Node 20 using nvm.

## Commands

- `npm run check` — Run full validation pipeline: lint + test + build
- `npm run lint` — ESLint via `next lint`
- `npm run test` — Vitest unit tests
- `npm run build` — Next.js production build
- `npm run dev` — Local dev server (http://localhost:3001)
- `npm run create-project -- <name> [WidgetName]` — Scaffold a new widget project from the dash-electron template

## Automation Cycle

Always work on feature branches, never push directly to main.

```
git checkout -b feat/<feature-name>
# ... make changes ...
npm run check
npm version patch              # auto-runs check via preversion hook
git push -u origin feat/<feature-name>
gh pr create --title "..." --body "..."
```

### Steps

1. **Branch** — `git checkout -b feat/<name>` or `fix/<name>`
2. **Change** — Edit files as needed
3. **Validate** — `npm run check` (lint + test + build)
4. **Version** — `npm version patch|minor|major` (preversion hook re-runs check; aborts on failure)
5. **Push** — `git push -u origin <branch>`
6. **PR** — `gh pr create`

### Version Bump Guidance

- **patch** — Bug fixes, metadata updates, small tweaks
- **minor** — New API endpoints, new features
- **major** — Breaking changes to API contracts or DynamoDB schema

## Commit Messages

Use conventional-style messages:

- `feat: add <feature>` — new endpoint, new UI, new entitlement type
- `fix: correct <area>` — bug fix
- `chore: update <area>` — non-functional cleanup
- `docs: update <doc>` — docs only

## Publishing Packages

Packages are published from the Dash desktop app, not by editing this repo. The flow:

1. User clicks Publish in Dash → app generates a manifest + zips the package
2. App posts to `POST /api/publish` with auth
3. The endpoint validates, uploads the ZIP to S3, writes Package + PackageVersion + owner Entitlement to DynamoDB
4. The package is immediately discoverable via `/api/packages`

See `CONTRIBUTING.md` for the full publish flow + manifest schema.

## Things to Avoid

- Never push directly to main — always use feature branches and PRs
- Never skip checks — `npm run check` mirrors what CI runs
- Never use `git push --force` or `git reset --hard`
- Never bypass preversion hook with `--ignore-scripts`
- Never re-introduce the static `packages/` mechanism — DynamoDB is canonical
