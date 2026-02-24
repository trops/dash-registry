import fs from "fs";
import path from "path";

export interface WidgetProvider {
    type: string;
    required: boolean;
}

export interface Widget {
    name: string;
    displayName: string;
    description: string;
    icon?: string;
    providers: WidgetProvider[];
}

export interface Package {
    name: string;
    displayName: string;
    author: string;
    description: string;
    version: string;
    category: string;
    tags: string[];
    downloadUrl: string;
    repository: string;
    publishedAt: string;
    widgets: Widget[];
    deprecated?: boolean;
    deprecatedMessage?: string;
}

export interface RegistryIndex {
    version: string;
    lastUpdated: string;
    packages: Package[];
}

function loadRegistryIndex(): RegistryIndex {
    const filePath = path.join(process.cwd(), "public", "registry-index.json");
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as RegistryIndex;
}

export function getRegistryIndex(): RegistryIndex {
    return loadRegistryIndex();
}

export function getAllPackages(): Package[] {
    return getRegistryIndex().packages;
}

export function getPackageByName(name: string): Package | undefined {
    return getAllPackages().find((pkg) => pkg.name === name);
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
