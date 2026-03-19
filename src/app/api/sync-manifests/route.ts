/**
 * POST /api/sync-manifests
 *
 * Syncs package manifests from the bundled registry-index.json into DynamoDB.
 * No auth required — the data is already public (committed to the repo).
 * Idempotent: re-syncing the same manifests updates existing records.
 *
 * Used to populate DynamoDB after deployment when manifests are added to the repo.
 */
import { NextResponse } from "next/server";
import { putPackage, putPackageVersion, getPackage } from "@/lib/db";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST() {

    try {
        const results: { name: string; status: string }[] = [];

        // Try to read from packages/ directory first
        const packagesDir = path.resolve(process.cwd(), "packages");
        let manifests: Record<string, unknown>[] = [];

        if (fs.existsSync(packagesDir)) {
            const scopeDirs = fs
                .readdirSync(packagesDir, { withFileTypes: true })
                .filter((e) => e.isDirectory());

            for (const scopeDir of scopeDirs) {
                const scopePath = path.join(packagesDir, scopeDir.name);
                const pkgDirs = fs
                    .readdirSync(scopePath, { withFileTypes: true })
                    .filter((e) => e.isDirectory());

                for (const pkgDir of pkgDirs) {
                    const manifestPath = path.join(
                        scopePath,
                        pkgDir.name,
                        "manifest.json",
                    );
                    if (fs.existsSync(manifestPath)) {
                        const manifest = JSON.parse(
                            fs.readFileSync(manifestPath, "utf8"),
                        );
                        manifests.push(manifest);
                    }
                }
            }
        }

        // Fallback: read from registry-index.json
        if (manifests.length === 0) {
            const indexPath = path.resolve(
                process.cwd(),
                "public",
                "registry-index.json",
            );
            if (fs.existsSync(indexPath)) {
                const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
                manifests = index.packages || [];
            }
        }

        if (manifests.length === 0) {
            return NextResponse.json({
                synced: 0,
                message: "No manifests found",
            });
        }

        // Sync each manifest to DynamoDB
        for (const manifest of manifests) {
            const scope =
                (manifest.githubUser as string) ||
                (manifest.scope as string) ||
                "";
            const name = (manifest.name as string) || "";
            const now = new Date().toISOString();

            try {
                // Check if package exists (preserve ownerId if it does)
                const existing = await getPackage(scope, name);

                const packageRecord: Record<string, unknown> = {
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
                    ownerId: existing?.ownerId || "sync",
                    downloadUrl: manifest.downloadUrl || "",
                    widgets: manifest.widgets || [],
                    createdAt: existing?.createdAt || now,
                };
                if (manifest.appOrigin) {
                    packageRecord.appOrigin = manifest.appOrigin;
                }
                if (manifest.providerTypes) {
                    packageRecord.providerTypes = manifest.providerTypes;
                }

                await putPackage(packageRecord);

                // Create version record
                const versionRecord: Record<string, unknown> = {
                    packageScope: scope,
                    packageName: name,
                    sk: `${name}#${manifest.version}`,
                    version: manifest.version,
                    downloadUrl: manifest.downloadUrl || "",
                    manifest,
                    widgets: manifest.widgets || [],
                    providers: [],
                    eventWiring: [],
                    fileSize: null,
                    ownerId: existing?.ownerId || "sync",
                    createdAt: now,
                };
                if (manifest.appOrigin) {
                    versionRecord.appOrigin = manifest.appOrigin;
                }
                await putPackageVersion(versionRecord);

                results.push({ name: `${scope}/${name}`, status: "ok" });
            } catch (err) {
                const errMsg =
                    err instanceof Error ? err.message : String(err);
                results.push({
                    name: `${scope}/${name}`,
                    status: `error: ${errMsg}`,
                });
            }
        }

        const ok = results.filter((r) => r.status === "ok").length;
        return NextResponse.json({
            synced: ok,
            total: results.length,
            results,
        });
    } catch (err) {
        console.error("[API /sync-manifests] Error:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
