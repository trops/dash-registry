/**
 * Registry data loading.
 *
 * In production (with API): fetches from /api/packages endpoints.
 * Fallback: reads from static registry-index.json (for build-time / static rendering).
 */
import fs from "fs";
import path from "path";

export interface WidgetProvider {
    type: string;
    required: boolean;
}

export interface Widget {
    name: string;
    displayName?: string;
    description?: string;
    icon?: string;
    id?: string;
    package?: string;
    version?: string;
    required?: boolean;
    author?: string;
    providers?: WidgetProvider[];
}

export interface Package {
    scope?: string;
    githubUser?: string;
    name: string;
    displayName: string;
    author: string;
    description: string;
    version: string;
    category: string;
    tags: string[];
    downloadUrl: string;
    repository?: string;
    publishedAt: string;
    widgets: Widget[];
    deprecated?: boolean;
    deprecatedMessage?: string;
    type?: string;
    appOrigin?: string;
    latestVersion?: string;
    theme?: {
        key?: string;
        name?: string;
        registryPackage?: string;
        colors?: {
            primary?: string;
            secondary?: string;
            tertiary?: string;
        };
    };
}

export interface RegistryIndex {
    version: string;
    lastUpdated: string;
    packages: Package[];
}

/**
 * Load registry index from static file (used for server components at build time).
 * Falls back gracefully if file doesn't exist.
 */
function loadStaticRegistryIndex(): RegistryIndex {
    const filePath = path.join(process.cwd(), "public", "registry-index.json");
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        return JSON.parse(raw) as RegistryIndex;
    } catch {
        return { version: "1.0.0", lastUpdated: new Date().toISOString(), packages: [] };
    }
}

export function getRegistryIndex(): RegistryIndex {
    return loadStaticRegistryIndex();
}

export function getAllPackages(): Package[] {
    return getRegistryIndex().packages;
}

export function getPackageByName(name: string): Package | undefined {
    return getAllPackages().find((pkg) => pkg.name === name);
}

export function getPackageByScope(
    scope: string,
    name: string,
): Package | undefined {
    return getAllPackages().find(
        (pkg) =>
            (pkg.githubUser === scope || pkg.scope === scope) &&
            pkg.name === name,
    );
}

export function getAllCategories(): string[] {
    const categories = new Set<string>();
    getAllPackages().forEach((pkg) => {
        if (pkg.category) categories.add(pkg.category);
    });
    return Array.from(categories).sort();
}

export function getAllTags(): string[] {
    const tags = new Set<string>();
    getAllPackages().forEach((pkg) => {
        (pkg.tags || []).forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
}
