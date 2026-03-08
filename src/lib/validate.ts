/**
 * Manifest validation for API-submitted packages.
 *
 * Reuses the same validation rules as scripts/validate-packages.js
 * but adapted for runtime use in API routes.
 */

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+)?$/;
const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]+$/;

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

interface Widget {
    name?: string;
    displayName?: string;
    description?: string;
    icon?: string;
    id?: string;
    providers?: Array<{ type?: string; required?: boolean }>;
}

interface Manifest {
    scope?: string;
    githubUser?: string;
    name?: string;
    displayName?: string;
    version?: string;
    downloadUrl?: string;
    widgets?: Widget[];
    author?: string;
    description?: string;
    category?: string;
    tags?: string[];
    repository?: string;
    type?: string;
    icon?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export function validateManifest(manifest: Manifest): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // scope or githubUser
    const scope = manifest.scope || manifest.githubUser;
    if (!scope) {
        errors.push('"scope" or "githubUser" is required');
    } else if (typeof scope !== "string") {
        errors.push('"scope" must be a string');
    }

    // name
    if (!manifest.name) {
        errors.push('"name" is required');
    } else if (!KEBAB_CASE.test(manifest.name)) {
        errors.push(`"name" must be kebab-case (got "${manifest.name}")`);
    } else if (manifest.name.length < 2 || manifest.name.length > 50) {
        errors.push('"name" must be 2-50 characters');
    }

    // displayName
    if (!manifest.displayName) {
        errors.push('"displayName" is required');
    } else if (manifest.displayName.length > 100) {
        errors.push('"displayName" must be at most 100 characters');
    }

    // version
    if (!manifest.version) {
        errors.push('"version" is required');
    } else if (!SEMVER.test(manifest.version)) {
        errors.push(`"version" must be valid semver (got "${manifest.version}")`);
    }

    // widgets
    if (!manifest.widgets || !Array.isArray(manifest.widgets)) {
        errors.push('"widgets" must be a non-empty array');
    } else if (manifest.widgets.length === 0) {
        errors.push('"widgets" must be a non-empty array');
    } else {
        const widgetNames = new Set<string>();
        manifest.widgets.forEach((widget, i) => {
            const prefix = `widgets[${i}]`;
            if (!widget.name) {
                errors.push(`${prefix}.name is required`);
            } else if (!PASCAL_CASE.test(widget.name)) {
                errors.push(
                    `${prefix}.name must be PascalCase (got "${widget.name}")`,
                );
            } else if (widgetNames.has(widget.name)) {
                errors.push(`${prefix}.name "${widget.name}" is a duplicate`);
            } else {
                widgetNames.add(widget.name);
            }

            if (!widget.displayName) {
                errors.push(`${prefix}.displayName is required`);
            }
            if (!widget.description) {
                errors.push(`${prefix}.description is required`);
            }
        });
    }

    // Optional fields
    if (manifest.category && !VALID_CATEGORIES.includes(manifest.category)) {
        warnings.push(
            `"category" not recognized (got "${manifest.category}")`,
        );
    }

    if (manifest.tags && manifest.tags.length > 10) {
        warnings.push('"tags" should have at most 10 items');
    }

    if (manifest.author && manifest.author.length > 100) {
        warnings.push('"author" should be at most 100 characters');
    }

    if (manifest.description && manifest.description.length > 500) {
        warnings.push('"description" should be at most 500 characters');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
