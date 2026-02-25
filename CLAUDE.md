# dash-registry

Widget registry and marketplace for Dash. Built with Next.js 14, React 18, TypeScript, and Tailwind CSS.

**Live site:** https://trops.github.io/dash-registry/

## Project Structure

- `packages/` — Scoped widget package manifests (`packages/{scope}/{name}/manifest.json`)
- `scripts/` — Build and validation scripts (`build-index.js`, `validate-packages.js`)
- `src/` — Next.js app source code
- `public/` — Static assets including generated `registry-index.json`

## Commands

- `npm run check` — Run full validation pipeline: validate + lint + build
- `npm run validate` — Validate package manifests
- `npm run lint` — ESLint
- `npm run build` — Build index and Next.js site
- `npm run dev` — Local dev server
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
3. **Validate** — `npm run check` (validate + lint + build)
4. **Version** — `npm version patch|minor|major` (preversion hook re-runs check; aborts on failure)
5. **Push** — `git push -u origin <branch>`
6. **PR** — `gh pr create`

### Version Bump Guidance

- **patch** — Bug fixes, metadata updates, small tweaks
- **minor** — New packages added, new features
- **major** — Breaking changes to registry schema or API

## Commit Messages

Use conventional-style messages:

- `feat: add <widget-name> package`
- `fix: correct <widget-name> manifest`
- `chore: update build scripts`
- `docs: update README`

## Package Manifests

Each widget in `packages/` must have a valid JSON manifest. Run `npm run validate` to check all manifests against the schema.

## Things to Avoid

- Never push directly to main — always use feature branches and PRs
- Never skip checks — `npm run check` mirrors the CI pipeline (`validate-pr.yml`)
- Never use `git push --force` or `git reset --hard`
- Never bypass preversion hook with `--ignore-scripts`
