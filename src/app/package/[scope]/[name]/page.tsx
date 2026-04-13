import { WidgetList } from "@/components/WidgetList";
import { ManageAccessLink } from "@/components/ManageAccessLink";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Package } from "@/lib/registry";

export const dynamic = "force-dynamic";

interface PackageVersion {
    version: string;
    createdAt: string;
    fileSize?: number;
}

interface PackageDetail extends Package {
    versions?: PackageVersion[];
    ownerId?: string;
    visibility?: string;
}

async function fetchPackageDetail(
    scope: string,
    name: string,
): Promise<PackageDetail | null> {
    const baseUrl = process.env.REGISTRY_BASE_URL || "http://localhost:3000";
    try {
        const res = await fetch(`${baseUrl}/api/packages/${scope}/${name}`, {
            cache: "no-store",
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return await res.json();
    } catch {
        // Fallback to static registry
        const { getPackageByScope } = await import("@/lib/registry");
        return getPackageByScope(scope, name) || null;
    }
}

export default async function PackageDetailPage({
    params,
}: {
    params: { scope: string; name: string };
}) {
    const pkg = await fetchPackageDetail(params.scope, params.name);

    if (!pkg) {
        notFound();
    }

    return (
        <div className="max-w-4xl mx-auto px-6 py-12">
            {/* Breadcrumb */}
            <div className="mb-6">
                <Link
                    href="/"
                    className="text-sm text-dash-accent hover:underline"
                >
                    &larr; Back to Registry
                </Link>
            </div>

            {/* Deprecation Banner */}
            {pkg.deprecated && (
                <div className="mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <div className="flex items-center gap-2 text-yellow-400">
                        <span className="text-lg">&#9888;</span>
                        <span className="font-semibold">
                            This package is deprecated
                        </span>
                    </div>
                    {pkg.deprecatedMessage && (
                        <p className="text-sm text-yellow-400/80 mt-1 ml-7">
                            {pkg.deprecatedMessage}
                        </p>
                    )}
                </div>
            )}

            {/* Package Header */}
            <div className="mb-8">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">
                            {pkg.displayName}
                        </h1>
                        <p className="text-dash-muted">
                            by{" "}
                            <span className="text-white">{pkg.author}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {pkg.visibility === "private" && (
                            <span className="text-xs px-2 py-1 rounded bg-amber-500/10 border border-amber-500/40 text-amber-300 uppercase tracking-wide">
                                Private
                            </span>
                        )}
                        <span className="text-sm px-3 py-1 rounded bg-dash-surface border border-dash-border text-dash-muted">
                            v{pkg.latestVersion || pkg.version}
                        </span>
                    </div>
                </div>

                {pkg.ownerId && pkg.scope && pkg.name && (
                    <div className="mt-3">
                        <ManageAccessLink
                            scope={pkg.scope}
                            name={pkg.name}
                            ownerId={pkg.ownerId}
                            visibility={pkg.visibility}
                        />
                    </div>
                )}

                <p className="text-base text-dash-text mt-4">
                    {pkg.description}
                </p>

                {/* Tags */}
                {pkg.tags && pkg.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                        {pkg.tags.map((tag) => (
                            <span
                                key={tag}
                                className="text-xs px-2 py-1 rounded bg-dash-surface border border-dash-border text-dash-muted"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Install Instructions */}
            <div className="mb-8 p-5 rounded-lg bg-dash-surface border border-dash-border">
                <h2 className="text-lg font-semibold text-white mb-3">
                    Installation
                </h2>
                <p className="text-sm text-dash-muted mb-3">
                    This package is available in the Dash app&apos;s Discover
                    tab. You can also install it directly from the registry.
                </p>
                {pkg.downloadUrl && (
                    <div className="bg-dash-bg rounded p-3 font-mono text-sm text-dash-text overflow-x-auto">
                        <code>
                            {pkg.downloadUrl
                                .replace(
                                    /\{version\}/g,
                                    pkg.latestVersion || pkg.version,
                                )
                                .replace(/\{name\}/g, pkg.name)}
                        </code>
                    </div>
                )}
            </div>

            {/* Version History */}
            {pkg.versions && pkg.versions.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-white mb-4">
                        Version History
                    </h2>
                    <div className="space-y-2">
                        {pkg.versions.map((v) => (
                            <div
                                key={v.version}
                                className="flex items-center justify-between p-3 rounded-lg bg-dash-bg border border-dash-border"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-mono text-white">
                                        v{v.version}
                                    </span>
                                    {v.version ===
                                        (pkg.latestVersion || pkg.version) && (
                                        <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30">
                                            latest
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-dash-muted">
                                    {v.fileSize && (
                                        <span>
                                            {(v.fileSize / 1024).toFixed(1)} KB
                                        </span>
                                    )}
                                    {v.createdAt && (
                                        <span>
                                            {new Date(
                                                v.createdAt,
                                            ).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Theme Colors (standalone themes) */}
            {pkg.type === "theme" && (() => {
                const colors = pkg.colors || pkg.theme?.colors;
                if (!colors) return null;
                const entries = (["primary", "secondary", "tertiary"] as const)
                    .map((key) => ({ key, value: colors[key] }))
                    .filter((e) => e.value);
                if (entries.length === 0) return null;
                return (
                    <div className="mb-8">
                        <h2 className="text-lg font-semibold text-white mb-4">
                            Theme Colors
                        </h2>
                        <div className="flex items-center gap-6">
                            {entries.map(({ key, value }) => (
                                <div
                                    key={key}
                                    className="flex flex-col items-center gap-2"
                                >
                                    <div
                                        className="h-16 w-16 rounded-lg border-2 border-dash-border"
                                        style={{
                                            backgroundColor: value,
                                        }}
                                    />
                                    <span className="text-sm text-white capitalize">
                                        {key}
                                    </span>
                                    <span className="text-xs text-dash-muted font-mono">
                                        {value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* Bundled Theme */}
            {pkg.theme && (
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-white mb-4">
                        Included Theme
                    </h2>
                    <div className="p-4 rounded-lg bg-dash-bg border border-dash-border flex items-center gap-4">
                        <span className="text-2xl">{"\uD83C\uDFA8"}</span>
                        <div className="flex-1">
                            <h4 className="text-base font-medium text-white">
                                {pkg.theme.name ||
                                    pkg.theme.key ||
                                    "Bundled Theme"}
                            </h4>
                            <p className="text-sm text-dash-muted mt-0.5">
                                Auto-installed with this dashboard
                            </p>
                        </div>
                        {pkg.theme.colors && (
                            <div className="flex items-center gap-2">
                                {(
                                    ["primary", "secondary", "tertiary"] as const
                                ).map((key) => {
                                    const color = pkg.theme?.colors?.[key];
                                    if (!color) return null;
                                    return (
                                        <div
                                            key={key}
                                            className="flex flex-col items-center gap-1"
                                        >
                                            <div
                                                className="h-8 w-8 rounded-full border-2 border-dash-border"
                                                style={{
                                                    backgroundColor: color,
                                                }}
                                            />
                                            <span className="text-[10px] text-dash-muted capitalize">
                                                {key}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Widgets */}
            {pkg.widgets && pkg.widgets.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-white mb-4">
                        Included Widgets ({pkg.widgets.length})
                    </h2>
                    <WidgetList widgets={pkg.widgets} />
                </div>
            )}

            {/* Links */}
            <div className="flex gap-4">
                {pkg.repository && (
                    <a
                        href={pkg.repository}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-4 py-2 rounded-lg bg-dash-surface border border-dash-border text-dash-muted hover:text-white hover:border-dash-accent/50 transition-colors text-sm"
                    >
                        View Source
                    </a>
                )}
            </div>
        </div>
    );
}
