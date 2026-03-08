#!/usr/bin/env node

/**
 * migrate-to-dynamo.js
 *
 * Imports existing package manifests from packages/ into DynamoDB.
 * Run after Amplify deployment to seed the database with existing data.
 *
 * Usage:
 *   AWS_REGION=us-east-1 \
 *   PACKAGES_TABLE=dash-registry-Packages \
 *   PACKAGE_VERSIONS_TABLE=dash-registry-PackageVersions \
 *   node scripts/migrate-to-dynamo.js [--dry-run]
 */

const fs = require("fs");
const path = require("path");
const {
    DynamoDBClient,
    DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const PACKAGES_DIR = path.resolve(__dirname, "..", "packages");
const DRY_RUN = process.argv.includes("--dry-run");

const PACKAGES_TABLE =
    process.env.PACKAGES_TABLE || "dash-registry-Packages";
const PACKAGE_VERSIONS_TABLE =
    process.env.PACKAGE_VERSIONS_TABLE || "dash-registry-PackageVersions";

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
});
const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
});

async function checkTable(tableName) {
    try {
        await client.send(
            new DescribeTableCommand({ TableName: tableName }),
        );
        return true;
    } catch (err) {
        if (err.name === "ResourceNotFoundException") return false;
        throw err;
    }
}

async function migrate() {
    console.log("Migrating packages to DynamoDB...");
    if (DRY_RUN) console.log("(DRY RUN - no writes will be made)\n");

    // Check tables exist
    if (!DRY_RUN) {
        const packagesExists = await checkTable(PACKAGES_TABLE);
        const versionsExists = await checkTable(PACKAGE_VERSIONS_TABLE);
        if (!packagesExists || !versionsExists) {
            console.error(
                "Tables not found. Deploy Amplify backend first.",
            );
            console.error(`  Packages: ${PACKAGES_TABLE} — ${packagesExists}`);
            console.error(
                `  Versions: ${PACKAGE_VERSIONS_TABLE} — ${versionsExists}`,
            );
            process.exit(1);
        }
    }

    // Read all manifests
    const scopeDirs = fs
        .readdirSync(PACKAGES_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory());

    let migrated = 0;
    let errors = 0;

    for (const scopeDir of scopeDirs) {
        const scopePath = path.join(PACKAGES_DIR, scopeDir.name);
        const pkgDirs = fs
            .readdirSync(scopePath, { withFileTypes: true })
            .filter((e) => e.isDirectory());

        for (const pkgDir of pkgDirs) {
            const manifestPath = path.join(
                scopePath,
                pkgDir.name,
                "manifest.json",
            );

            if (!fs.existsSync(manifestPath)) {
                console.log(`  SKIP ${scopeDir.name}/${pkgDir.name} — no manifest`);
                continue;
            }

            let manifest;
            try {
                manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            } catch (e) {
                console.log(
                    `  ERROR ${scopeDir.name}/${pkgDir.name} — invalid JSON`,
                );
                errors++;
                continue;
            }

            const scope = manifest.githubUser || manifest.scope;
            const name = manifest.name;
            const now = new Date().toISOString();

            // Build Package record
            const packageRecord = {
                scope,
                name,
                displayName: manifest.displayName,
                author: manifest.author || scope,
                description: manifest.description || "",
                type: manifest.type || "widget",
                category: manifest.category || "general",
                tags: manifest.tags || [],
                icon: manifest.icon || "",
                latestVersion: manifest.version,
                repository: manifest.repository || "",
                visibility: "public",
                ownerId: "migration", // placeholder until users claim
                downloadUrl: manifest.downloadUrl || "",
                createdAt: manifest.publishedAt || now,
                updatedAt: now,
            };

            // Build PackageVersion record
            const versionRecord = {
                packageScope: scope,
                packageName: name,
                version: manifest.version,
                downloadUrl: manifest.downloadUrl || "",
                manifest: manifest,
                widgets: manifest.widgets || [],
                providers: [],
                eventWiring: [],
                fileSize: null,
                ownerId: "migration",
                createdAt: manifest.publishedAt || now,
            };

            if (DRY_RUN) {
                console.log(`  DRY ${scope}/${name} v${manifest.version}`);
                console.log(
                    `    Package: ${JSON.stringify(packageRecord).slice(0, 100)}...`,
                );
                migrated++;
                continue;
            }

            try {
                await docClient.send(
                    new PutCommand({
                        TableName: PACKAGES_TABLE,
                        Item: packageRecord,
                    }),
                );
                await docClient.send(
                    new PutCommand({
                        TableName: PACKAGE_VERSIONS_TABLE,
                        Item: versionRecord,
                    }),
                );
                console.log(`  OK ${scope}/${name} v${manifest.version}`);
                migrated++;
            } catch (err) {
                console.log(
                    `  ERROR ${scope}/${name} — ${err.message}`,
                );
                errors++;
            }
        }
    }

    console.log(
        `\nMigration complete: ${migrated} packages migrated, ${errors} errors`,
    );
}

migrate().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
