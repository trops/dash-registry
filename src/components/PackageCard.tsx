"use client";

import Link from "next/link";
import type { Package } from "@/lib/registry";

interface PackageCardProps {
    pkg: Package;
}

const iconMap: Record<string, string> = {
    sun: "\u2600\uFE0F",
    calendar: "\uD83D\uDCC5",
    clock: "\u23F0",
    "check-square": "\u2705",
    "git-branch": "\uD83D\uDD00",
    activity: "\uD83D\uDCCA",
    heart: "\u2764\uFE0F",
    "alert-triangle": "\u26A0\uFE0F",
};

function getIcon(icon?: string): string {
    if (!icon) return "\uD83D\uDCE6";
    return iconMap[icon] || "\uD83D\uDCE6";
}

export function PackageCard({ pkg }: PackageCardProps) {
    return (
        <Link
            href={`/package/${pkg.name}`}
            className="block p-5 rounded-lg bg-dash-surface border border-dash-border hover:border-dash-accent/50 transition-all hover:shadow-lg hover:shadow-dash-accent/5 group"
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                    <span className="text-2xl">
                        {getIcon(pkg.widgets?.[0]?.icon)}
                    </span>
                    <div>
                        <h3 className="text-lg font-semibold text-white group-hover:text-dash-accent transition-colors">
                            {pkg.displayName}
                        </h3>
                        <p className="text-sm text-dash-muted">
                            by {pkg.author}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {pkg.deprecated && (
                        <span className="text-xs px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">
                            Deprecated
                        </span>
                    )}
                    <span className="text-xs px-2 py-1 rounded bg-dash-bg text-dash-muted">
                        v{pkg.version}
                    </span>
                </div>
            </div>

            <p className="text-sm text-dash-muted mb-3 line-clamp-2">
                {pkg.description}
            </p>

            <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                    {pkg.tags.slice(0, 3).map((tag) => (
                        <span
                            key={tag}
                            className="text-xs px-2 py-0.5 rounded bg-dash-bg text-dash-muted"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
                <span className="text-xs text-dash-muted">
                    {pkg.widgets.length} widget
                    {pkg.widgets.length !== 1 ? "s" : ""}
                </span>
            </div>
        </Link>
    );
}
