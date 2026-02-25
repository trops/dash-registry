#!/usr/bin/env node

/**
 * build-index.js
 *
 * Aggregates all package manifests from packages/ into a single
 * registry-index.json that the Dash app fetches.
 *
 * Run: npm run build-index
 * Output: public/registry-index.json
 */

const fs = require("fs");
const path = require("path");

const PACKAGES_DIR = path.resolve(__dirname, "..", "packages");
const OUTPUT_FILE = path.resolve(__dirname, "..", "public", "registry-index.json");

function main() {
    const packages = [];

    if (!fs.existsSync(PACKAGES_DIR)) {
        console.warn("No packages/ directory found. Creating empty index.");
        writeIndex(packages);
        return;
    }

    const scopeDirs = fs.readdirSync(PACKAGES_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory());

    for (const scopeDir of scopeDirs) {
        const scopePath = path.join(PACKAGES_DIR, scopeDir.name);
        const pkgDirs = fs.readdirSync(scopePath, { withFileTypes: true })
            .filter((e) => e.isDirectory());

        for (const pkgDir of pkgDirs) {
            const manifestPath = path.join(scopePath, pkgDir.name, "manifest.json");
            if (!fs.existsSync(manifestPath)) {
                console.warn(`Skipping ${scopeDir.name}/${pkgDir.name}: no manifest.json`);
                continue;
            }

            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

                // Validate required fields
                if (!manifest.name) {
                    console.warn(`Skipping ${scopeDir.name}/${pkgDir.name}: missing 'name' field`);
                    continue;
                }

                if (!manifest.downloadUrl) {
                    console.warn(`Warning: ${scopeDir.name}/${pkgDir.name} has no downloadUrl`);
                }

                packages.push(manifest);
                console.log(`  + ${manifest.scope || scopeDir.name}/${manifest.name} v${manifest.version || "?"} (${(manifest.widgets || []).length} widgets)`);
            } catch (error) {
                console.error(`Error parsing ${manifestPath}:`, error.message);
            }
        }
    }

    // Sort packages alphabetically by scope/name
    packages.sort((a, b) => {
        const aKey = `${a.scope || ""}/${a.name || ""}`;
        const bKey = `${b.scope || ""}/${b.name || ""}`;
        return aKey.localeCompare(bKey);
    });

    writeIndex(packages);
}

function writeIndex(packages) {
    const index = {
        version: "1.0.0",
        lastUpdated: new Date().toISOString(),
        packages,
    };

    // Ensure public/ directory exists
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2));
    console.log(`\nGenerated registry-index.json with ${packages.length} packages`);
    console.log(`Output: ${OUTPUT_FILE}`);
}

main();
