#!/usr/bin/env node

/**
 * validate-packages.js
 *
 * Validates all package manifests in packages/ against the registry schema.
 * Ensures naming conventions, required fields, URL safety, and cross-package uniqueness.
 *
 * Run: npm run validate
 * Exit code 1 on any error, 0 on success (warnings don't fail).
 */

const fs = require("fs");
const path = require("path");

const PACKAGES_DIR = path.resolve(__dirname, "..", "packages");

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+)?$/;
const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]+$/;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

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

// ── Helpers ──────────────────────────────────────────────────────────

function isValidUrl(str) {
    if (!str.startsWith("https://")) return false;
    try {
        new URL(str);
    } catch {
        return false;
    }
    if (/[<>"'`]/.test(str)) return false;
    return true;
}

// ── Per-manifest validation ──────────────────────────────────────────

function validateManifest(manifest, scopeDirName, pkgDirName, filePath) {
    const errors = [];
    const warnings = [];

    function err(msg) {
        errors.push(`ERROR: ${filePath}: ${msg}`);
    }
    function warn(msg) {
        warnings.push(`WARN:  ${filePath}: ${msg}`);
    }

    // scope
    if (!manifest.scope) {
        err('"scope" is required');
    } else if (typeof manifest.scope !== "string") {
        err('"scope" must be a string');
    } else {
        if (!KEBAB_CASE.test(manifest.scope)) {
            err(`"scope" must be kebab-case (got "${manifest.scope}")`);
        }
        if (manifest.scope !== scopeDirName) {
            err(`"scope" must match scope directory name (got "${manifest.scope}", directory is "${scopeDirName}")`);
        }
    }

    // name
    if (!manifest.name) {
        err('"name" is required');
    } else {
        if (typeof manifest.name !== "string") {
            err('"name" must be a string');
        } else {
            if (manifest.name.length < 2 || manifest.name.length > 50) {
                err('"name" must be 2–50 characters (got ' + manifest.name.length + ")");
            }
            if (!KEBAB_CASE.test(manifest.name)) {
                err(`"name" must be kebab-case (got "${manifest.name}")`);
            }
            if (manifest.name !== pkgDirName) {
                err(`"name" must match directory name (got "${manifest.name}", directory is "${pkgDirName}")`);
            }
        }
    }

    // displayName
    if (!manifest.displayName) {
        err('"displayName" is required');
    } else if (typeof manifest.displayName !== "string" || manifest.displayName.trim() === "") {
        err('"displayName" must be a non-empty string');
    } else if (manifest.displayName.length > 100) {
        err('"displayName" must be at most 100 characters (got ' + manifest.displayName.length + ")");
    }

    // version
    if (!manifest.version) {
        err('"version" is required');
    } else if (!SEMVER.test(manifest.version)) {
        err(`"version" must be valid semver (got "${manifest.version}")`);
    }

    // downloadUrl
    if (!manifest.downloadUrl) {
        err('"downloadUrl" is required');
    } else if (!isValidUrl(manifest.downloadUrl.replace(/\{[^}]+\}/g, "placeholder"))) {
        err(`"downloadUrl" must be a safe HTTPS URL (got "${manifest.downloadUrl}")`);
    }

    // widgets
    if (!manifest.widgets) {
        err('"widgets" is required');
    } else if (!Array.isArray(manifest.widgets) || manifest.widgets.length === 0) {
        err('"widgets" must be a non-empty array');
    } else {
        const widgetNames = new Set();
        manifest.widgets.forEach((widget, i) => {
            const prefix = `widgets[${i}]`;

            // widget.name
            if (!widget.name) {
                err(`${prefix}.name is required`);
            } else if (!PASCAL_CASE.test(widget.name)) {
                err(`${prefix}.name must be PascalCase (got "${widget.name}")`);
            } else if (widgetNames.has(widget.name)) {
                err(`${prefix}.name "${widget.name}" is a duplicate within this package`);
            } else {
                widgetNames.add(widget.name);
            }

            // widget.displayName
            if (!widget.displayName) {
                err(`${prefix}.displayName is required`);
            } else if (typeof widget.displayName !== "string" || widget.displayName.trim() === "") {
                err(`${prefix}.displayName must be a non-empty string`);
            }

            // widget.description
            if (!widget.description) {
                err(`${prefix}.description is required`);
            } else if (typeof widget.description !== "string" || widget.description.trim() === "") {
                err(`${prefix}.description must be a non-empty string`);
            }

            // widget.icon (optional)
            if (widget.icon !== undefined && typeof widget.icon !== "string") {
                warn(`${prefix}.icon should be a string`);
            }

            // widget.providers (optional)
            if (widget.providers !== undefined) {
                if (!Array.isArray(widget.providers)) {
                    warn(`${prefix}.providers should be an array`);
                } else {
                    widget.providers.forEach((p, j) => {
                        if (!p.type || typeof p.type !== "string") {
                            warn(`${prefix}.providers[${j}].type should be a non-empty string`);
                        }
                        if (typeof p.required !== "boolean") {
                            warn(`${prefix}.providers[${j}].required should be a boolean`);
                        }
                    });
                }
            }
        });
    }

    // author (optional)
    if (manifest.author !== undefined) {
        if (typeof manifest.author !== "string") {
            warn('"author" should be a string');
        } else if (manifest.author.length > 100) {
            warn('"author" should be at most 100 characters');
        }
    }

    // description (optional)
    if (manifest.description !== undefined) {
        if (typeof manifest.description !== "string") {
            warn('"description" should be a string');
        } else if (manifest.description.length > 500) {
            warn('"description" should be at most 500 characters');
        }
    }

    // category (optional)
    if (manifest.category !== undefined) {
        if (!VALID_CATEGORIES.includes(manifest.category)) {
            warn(`"category" not recognized (got "${manifest.category}", expected one of: ${VALID_CATEGORIES.join(", ")})`);
        }
    }

    // tags (optional)
    if (manifest.tags !== undefined) {
        if (!Array.isArray(manifest.tags)) {
            warn('"tags" should be an array');
        } else {
            if (manifest.tags.length > 10) {
                warn('"tags" should have at most 10 items (got ' + manifest.tags.length + ")");
            }
            manifest.tags.forEach((tag, i) => {
                if (typeof tag !== "string") {
                    warn(`tags[${i}] should be a string`);
                } else {
                    if (tag !== tag.toLowerCase()) {
                        warn(`tags[${i}] should be lowercase (got "${tag}")`);
                    }
                    if (tag.length > 30) {
                        warn(`tags[${i}] should be at most 30 characters`);
                    }
                }
            });
        }
    }

    // repository (optional)
    if (manifest.repository !== undefined) {
        if (typeof manifest.repository !== "string") {
            warn('"repository" should be a string');
        } else if (!isValidUrl(manifest.repository)) {
            err(`"repository" must be a safe HTTPS URL (got "${manifest.repository}")`);
        }
    }

    // publishedAt (optional)
    if (manifest.publishedAt !== undefined) {
        if (typeof manifest.publishedAt !== "string" || !ISO_8601.test(manifest.publishedAt)) {
            warn(`"publishedAt" should be a valid ISO 8601 date (got "${manifest.publishedAt}")`);
        }
    }

    // deprecated (optional)
    if (manifest.deprecated !== undefined && typeof manifest.deprecated !== "boolean") {
        warn('"deprecated" should be a boolean');
    }

    // deprecatedMessage (optional)
    if (manifest.deprecatedMessage !== undefined && typeof manifest.deprecatedMessage !== "string") {
        warn('"deprecatedMessage" should be a string');
    }

    return { errors, warnings };
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
    console.log("Validating packages...");

    if (!fs.existsSync(PACKAGES_DIR)) {
        console.log("No packages/ directory found. Nothing to validate.");
        process.exit(0);
    }

    const scopeDirs = fs.readdirSync(PACKAGES_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory());

    if (scopeDirs.length === 0) {
        console.log("No scope directories found. Nothing to validate.");
        process.exit(0);
    }

    let totalErrors = 0;
    let totalWarnings = 0;
    let totalPackages = 0;
    const allScopedNames = new Set();

    for (const scopeDir of scopeDirs) {
        const scopePath = path.join(PACKAGES_DIR, scopeDir.name);
        const pkgDirs = fs.readdirSync(scopePath, { withFileTypes: true })
            .filter((e) => e.isDirectory());

        for (const pkgDir of pkgDirs) {
            totalPackages++;
            const manifestPath = path.join(scopePath, pkgDir.name, "manifest.json");
            const relPath = `packages/${scopeDir.name}/${pkgDir.name}/manifest.json`;

            if (!fs.existsSync(manifestPath)) {
                console.log(`  \u2717 ${scopeDir.name}/${pkgDir.name}`);
                console.log(`    ERROR: ${relPath} not found`);
                totalErrors++;
                continue;
            }

            let manifest;
            try {
                manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            } catch (e) {
                console.log(`  \u2717 ${scopeDir.name}/${pkgDir.name}`);
                console.log(`    ERROR: ${relPath}: invalid JSON — ${e.message}`);
                totalErrors++;
                continue;
            }

            const { errors, warnings } = validateManifest(manifest, scopeDir.name, pkgDir.name, relPath);

            // Cross-package: duplicate scope/name check
            if (manifest.scope && manifest.name) {
                const scopedName = `${manifest.scope}/${manifest.name}`;
                if (allScopedNames.has(scopedName)) {
                    errors.push(`ERROR: ${relPath}: duplicate scoped package name "${scopedName}"`);
                } else {
                    allScopedNames.add(scopedName);
                }
            }

            if (errors.length === 0) {
                const widgetCount = Array.isArray(manifest.widgets) ? manifest.widgets.length : 0;
                const deprecatedTag = manifest.deprecated ? " [DEPRECATED]" : "";
                console.log(`  \u2713 ${scopeDir.name}/${pkgDir.name} (${widgetCount} widget${widgetCount !== 1 ? "s" : ""})${deprecatedTag}`);
            } else {
                console.log(`  \u2717 ${scopeDir.name}/${pkgDir.name}`);
            }

            for (const e of errors) {
                console.log(`    ${e}`);
            }
            for (const w of warnings) {
                console.log(`    ${w}`);
            }

            totalErrors += errors.length;
            totalWarnings += warnings.length;
        }
    }

    console.log("");

    if (totalErrors > 0) {
        console.log(
            `${totalErrors} error${totalErrors !== 1 ? "s" : ""}, ` +
            `${totalWarnings} warning${totalWarnings !== 1 ? "s" : ""} ` +
            `in ${totalPackages} package${totalPackages !== 1 ? "s" : ""}`
        );
        process.exit(1);
    }

    console.log(
        `0 errors, ${totalWarnings} warning${totalWarnings !== 1 ? "s" : ""} ` +
        `in ${totalPackages} package${totalPackages !== 1 ? "s" : ""}`
    );
    process.exit(0);
}

main();
