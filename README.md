# Dash Registry

Widget marketplace for the [Dash](https://github.com/trops/dash) Electron dashboard app. Browse, discover, and install community-built widgets.

**Live site:** Deployed to GitHub Pages via the `deploy.yml` workflow on push to `main`.

## Tech Stack

- **Next.js 14** — static export (`output: "export"`)
- **Tailwind CSS** — styling
- **Fuse.js** — client-side fuzzy search
- **GitHub Actions** — CI/CD (PR validation + deploy)

## Development

```bash
npm install
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (builds index first) |
| `npm run build` | Production build to `out/` |
| `npm run check` | Full validation pipeline: validate + lint + build |
| `npm run validate` | Validate all package manifests |
| `npm run lint` | Run Next.js linter |
| `npm run build-index` | Aggregate manifests into `public/registry-index.json` |
| `npm run create-project -- <name> [WidgetName]` | Scaffold a new widget project from the Dash template |

## Project Structure

```
packages/              # Scoped widget package manifests
  trops/               # Scope (GitHub username)
    dash-samples/
      manifest.json    # Package manifest (schema in CONTRIBUTING.md)
scripts/
  build-index.js       # Aggregates manifests → registry-index.json
  validate-packages.js # Manifest validation (runs in CI)
src/
  app/                 # Next.js app router pages
  components/          # React components
  lib/                 # Registry data loading
```

## Adding a Package

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide on adding, updating, deprecating, and removing packages.

## License

[MIT](LICENSE)
