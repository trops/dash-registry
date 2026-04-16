/**
 * Registry data types. The actual data lives in DynamoDB and is loaded
 * via the `/api/packages` endpoints. This file is intentionally types-
 * only — the static `registry-index.json` fallback was removed once all
 * packages were migrated to DynamoDB.
 */

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
    providerTypes?: string[];
    deprecated?: boolean;
    deprecatedMessage?: string;
    type?: string;
    appOrigin?: string;
    latestVersion?: string;
    colors?: {
        primary?: string;
        secondary?: string;
        tertiary?: string;
    };
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

