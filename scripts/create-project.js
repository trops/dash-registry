#!/usr/bin/env node

/**
 * create-project.js
 *
 * Scaffolds a new Dash widget project from the trops/dash-electron template.
 * Creates a GitHub repo, rewrites package.json, installs deps, and optionally
 * scaffolds the first widget.
 *
 * Usage: npm run create-project -- <project-name> [WidgetName]
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]+$/;

function fail(msg) {
    console.error(`\nError: ${msg}`);
    process.exit(1);
}

function run(cmd, opts = {}) {
    console.log(`  $ ${cmd}`);
    return execSync(cmd, { stdio: "inherit", ...opts });
}

function runCapture(cmd, opts = {}) {
    return execSync(cmd, { encoding: "utf8", ...opts }).trim();
}

function main() {
    const args = process.argv.slice(2);
    const projectName = args[0];
    const widgetName = args[1];

    // ── Validate args ────────────────────────────────────────────────
    if (!projectName) {
        fail("Usage: npm run create-project -- <project-name> [WidgetName]");
    }

    if (!KEBAB_CASE.test(projectName)) {
        fail(`Project name must be kebab-case (got "${projectName}")`);
    }

    if (widgetName && !PASCAL_CASE.test(widgetName)) {
        fail(`Widget name must be PascalCase (got "${widgetName}")`);
    }

    // ── Preflight checks ─────────────────────────────────────────────
    try {
        runCapture("gh --version");
    } catch {
        fail("GitHub CLI (gh) is not installed. Install it: https://cli.github.com");
    }

    try {
        runCapture("gh auth status");
    } catch {
        fail("GitHub CLI is not authenticated. Run: gh auth login");
    }

    const baseDir = process.env.INIT_CWD || process.cwd();
    const projectDir = path.join(baseDir, projectName);

    if (fs.existsSync(projectDir)) {
        fail(`Directory already exists: ${projectDir}`);
    }

    console.log(`\nCreating project "${projectName}" in ${baseDir}\n`);

    // ── Create repo from template ────────────────────────────────────
    console.log("Creating repository from template...");
    run(`gh repo create ${projectName} --template trops/dash-electron --public --clone`, {
        cwd: baseDir,
    });

    // ── Detect GitHub username ───────────────────────────────────────
    const username = runCapture("gh api user --jq .login");
    console.log(`\nDetected GitHub user: ${username}`);

    // ── Rewrite package.json ─────────────────────────────────────────
    console.log("\nRewriting package.json...");
    const pkgPath = path.join(projectDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkg.name = `@${username}/${projectName}`;
    pkg.author = username;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`  name  → ${pkg.name}`);
    console.log(`  author → ${pkg.author}`);

    // ── Install dependencies ─────────────────────────────────────────
    console.log("\nInstalling dependencies...");
    run("npm install", { cwd: projectDir });

    // ── Scaffold widget (optional) ───────────────────────────────────
    if (widgetName) {
        console.log(`\nScaffolding widget "${widgetName}"...`);
        run(`node ./scripts/widgetize.js ${widgetName}`, { cwd: projectDir });
    }

    // ── Commit setup changes ─────────────────────────────────────────
    console.log("\nCommitting setup changes...");
    run("git add -A", { cwd: projectDir });
    run('git commit -m "chore: initialize project"', { cwd: projectDir });

    // ── Summary ──────────────────────────────────────────────────────
    const branch = runCapture("git rev-parse --abbrev-ref HEAD", { cwd: projectDir });

    console.log("\n────────────────────────────────────────────");
    console.log(`Project created: ${projectDir}`);
    console.log(`Repository:      https://github.com/${username}/${projectName}`);
    console.log(`Branch:          ${branch}`);
    console.log("");
    console.log("Next steps:");
    console.log(`  cd ${projectName}`);
    console.log("  npm run dev          # start dev server");
    if (!widgetName) {
        console.log("  node ./scripts/widgetize.js MyWidget  # scaffold a widget");
    }
    console.log("  npm run build        # build for production");
    console.log("────────────────────────────────────────────\n");
}

main();
