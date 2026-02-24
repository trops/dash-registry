"use client";

import type { Widget } from "@/lib/registry";

interface WidgetListProps {
    widgets: Widget[];
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

export function WidgetList({ widgets }: WidgetListProps) {
    return (
        <div className="space-y-3">
            {widgets.map((widget) => (
                <div
                    key={widget.name}
                    className="p-4 rounded-lg bg-dash-bg border border-dash-border"
                >
                    <div className="flex items-start space-x-3">
                        <span className="text-xl mt-0.5">
                            {getIcon(widget.icon)}
                        </span>
                        <div className="flex-1">
                            <h4 className="text-base font-medium text-white">
                                {widget.displayName}
                            </h4>
                            <p className="text-sm text-dash-muted mt-1">
                                {widget.description}
                            </p>
                            {widget.providers && widget.providers.length > 0 && (
                                <div className="flex gap-1.5 mt-2">
                                    {widget.providers.map((p, idx) => (
                                        <span
                                            key={idx}
                                            className="text-xs px-2 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800/30"
                                        >
                                            {p.type}
                                            {p.required ? " (required)" : ""}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
