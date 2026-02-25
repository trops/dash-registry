# Contributing to Dash Registry

Thanks for your interest in contributing a widget package to the Dash Registry!

## Adding a New Package

1. **Create a directory** under `packages/{scope}/{name}/` where scope is your GitHub username (lowercase):
   ```
   packages/yourname/my-widgets/
   ```

2. **Create a `manifest.json`** in that directory following the schema below.

3. **Open a Pull Request** against `main`. The CI pipeline will validate your manifest, run linting, and build the site.

4. A maintainer will review and merge your PR.

## Manifest Schema

### Required Fields

| Field | Type | Rules |
|-------|------|-------|
| `name` | `string` | Kebab-case, 2–50 chars, must match directory name |
| `scope` | `string` | GitHub username (lowercase), must match scope directory |
| `displayName` | `string` | Non-empty, max 100 chars |
| `version` | `string` | Valid semver (e.g., `1.0.0`, `2.1.0-beta`) |
| `downloadUrl` | `string` | HTTPS URL (may contain `{version}` and `{name}` placeholders) |
| `widgets` | `array` | Non-empty array of widget objects (see below) |

### Optional Fields

| Field | Type | Rules |
|-------|------|-------|
| `author` | `string` | Max 100 chars |
| `description` | `string` | Max 500 chars |
| `category` | `string` | One of: `general`, `utilities`, `productivity`, `development`, `social`, `media`, `finance`, `health`, `education`, `other` |
| `tags` | `string[]` | Max 10 items, each lowercase, max 30 chars |
| `repository` | `string` | HTTPS URL |
| `publishedAt` | `string` | ISO 8601 date (e.g., `2026-01-15T10:00:00Z`) |
| `deprecated` | `boolean` | Mark the package as deprecated |
| `deprecatedMessage` | `string` | Explanation for deprecation |

### Widget Object

Each entry in the `widgets` array:

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `name` | `string` | Yes | PascalCase (e.g., `CurrentWeather`) |
| `displayName` | `string` | Yes | Non-empty |
| `description` | `string` | Yes | Non-empty |
| `icon` | `string` | No | Icon identifier |
| `providers` | `array` | No | Array of `{ type: string, required: boolean }` |

### Example

```json
{
    "name": "my-widgets",
    "scope": "yourname",
    "displayName": "My Widgets",
    "author": "Your Name",
    "description": "A collection of useful widgets.",
    "version": "1.0.0",
    "category": "utilities",
    "tags": ["example"],
    "downloadUrl": "https://github.com/you/my-widgets/releases/download/v{version}/my-widgets-v{version}.zip",
    "repository": "https://github.com/you/my-widgets",
    "publishedAt": "2026-01-01T00:00:00Z",
    "widgets": [
        {
            "name": "ExampleWidget",
            "displayName": "Example Widget",
            "description": "Does something useful.",
            "icon": "sun",
            "providers": [{ "type": "some-api", "required": true }]
        }
    ]
}
```

## Updating a Package

1. Update the `manifest.json` in your package directory (bump `version`, update fields).
2. Open a PR — the same validation pipeline runs.

## Removing a Package

### Who Can Remove

Only the **original package author** (or a designated maintainer) may request removal. The registry maintainer (@trops) verifies the requester's identity during PR review via CODEOWNERS.

### Soft Deprecation (Recommended First Step)

Add `"deprecated": true` and optionally `"deprecatedMessage"` to your `manifest.json`, then open a PR. The registry site will show a deprecation badge on the package card and a warning banner on the detail page. The Dash app can use this flag to warn users before they install.

### Hard Removal

To fully remove a package from the registry:

1. Open a PR that deletes the entire `packages/{scope}/{name}/` directory
2. In the PR description, state that you are the original author
3. A maintainer will verify and merge

After merge, the package will no longer appear on the registry site or in the Dash app's Discover tab.

## URL Safety

All URLs (`downloadUrl`, `repository`) must:
- Start with `https://`
- Be parseable as a valid URL
- Not contain `<`, `>`, `"`, `'`, or backticks

## Naming Rules

- **Scope**: Your GitHub username, lowercase (e.g., `yourname`)
- **Package name**: kebab-case (`my-cool-widgets`), 2–50 characters
- **Widget name**: PascalCase (`MyCoolWidget`)
- No duplicate package names within a scope
- No duplicate widget names within a package

## Local Validation

Run the validation script locally before opening a PR:

```bash
npm run validate
```

This is the same check that runs in CI.
