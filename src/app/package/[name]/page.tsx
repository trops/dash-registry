import { getAllPackages, getPackageByName } from "@/lib/registry";
import { WidgetList } from "@/components/WidgetList";
import { notFound } from "next/navigation";

export function generateStaticParams() {
    return getAllPackages().map((pkg) => ({
        name: pkg.name,
    }));
}

export default function PackageDetailPage({
    params,
}: {
    params: { name: string };
}) {
    const pkg = getPackageByName(params.name);

    if (!pkg) {
        notFound();
    }

    return (
        <div className="max-w-4xl mx-auto px-6 py-12">
            {/* Breadcrumb */}
            <div className="mb-6">
                <a
                    href="/"
                    className="text-sm text-dash-accent hover:underline"
                >
                    &larr; Back to Registry
                </a>
            </div>

            {/* Deprecation Banner */}
            {pkg.deprecated && (
                <div className="mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <div className="flex items-center gap-2 text-yellow-400">
                        <span className="text-lg">&#9888;</span>
                        <span className="font-semibold">This package is deprecated</span>
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
                    <span className="text-sm px-3 py-1 rounded bg-dash-surface border border-dash-border text-dash-muted">
                        v{pkg.version}
                    </span>
                </div>

                <p className="text-base text-dash-text mt-4">
                    {pkg.description}
                </p>

                {/* Tags */}
                {pkg.tags.length > 0 && (
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
                    tab. You can also install it manually:
                </p>
                <div className="bg-dash-bg rounded p-3 font-mono text-sm text-dash-text overflow-x-auto">
                    <code>
                        {pkg.downloadUrl
                            .replace(/\{version\}/g, pkg.version)
                            .replace(/\{name\}/g, pkg.name)}
                    </code>
                </div>
            </div>

            {/* Widgets */}
            <div className="mb-8">
                <h2 className="text-lg font-semibold text-white mb-4">
                    Included Widgets ({pkg.widgets.length})
                </h2>
                <WidgetList widgets={pkg.widgets} />
            </div>

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
