## What does this PR do?

<!-- Brief description of your changes -->

## Package Submission Checklist

If you're adding or updating a package, please verify:

- [ ] `manifest.json` is in `packages/{scope}/{name}/manifest.json`
- [ ] Package `name` is kebab-case and matches the directory name under `packages/{scope}/`
- [ ] `version` is valid semver
- [ ] `downloadUrl` is a valid HTTPS URL
- [ ] `widgets` array is non-empty with valid entries
- [ ] `npm run validate` passes locally
- [ ] Widget names are PascalCase and unique within the package

## Additional Context

<!-- Any other context about the PR -->
