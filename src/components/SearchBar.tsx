"use client";

import { useState, useEffect, useMemo } from "react";
import type { Package } from "@/lib/registry";
import { createSearchIndex, searchPackages } from "@/lib/search";
import { PackageCard } from "./PackageCard";
import { CategoryFilter } from "./CategoryFilter";

interface SearchBarProps {
    packages: Package[];
    categories: string[];
    appOrigins: string[];
}

const TYPE_OPTIONS = [
    { label: "All", value: null },
    { label: "Widgets", value: "widget" },
    { label: "Dashboards", value: "dashboard" },
];

export function SearchBar({ packages, categories, appOrigins }: SearchBarProps) {
    const [query, setQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(
        null,
    );
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [selectedAppOrigin, setSelectedAppOrigin] = useState("dash-electron");
    const [results, setResults] = useState<Package[]>(packages);
    const [showFilters, setShowFilters] = useState(false);

    const fuse = useMemo(() => createSearchIndex(packages), [packages]);

    const activeFilterCount =
        (selectedType ? 1 : 0) +
        (selectedAppOrigin ? 1 : 0) +
        (selectedCategory ? 1 : 0);

    useEffect(() => {
        let filtered: Package[];

        if (query.trim()) {
            filtered = searchPackages(fuse, query, packages);
        } else {
            filtered = packages;
        }

        if (selectedType) {
            filtered = filtered.filter(
                (pkg) => (pkg.type || "widget") === selectedType,
            );
        }

        if (selectedAppOrigin) {
            filtered = filtered.filter(
                (pkg) => pkg.appOrigin === selectedAppOrigin,
            );
        }

        if (selectedCategory) {
            filtered = filtered.filter(
                (pkg) => pkg.category === selectedCategory,
            );
        }

        setResults(filtered);
    }, [query, selectedCategory, selectedType, selectedAppOrigin, fuse, packages]);

    return (
        <div>
            {/* Search input — full width above everything */}
            <input
                type="text"
                placeholder="Search packages, widgets, tags..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-dash-surface border border-dash-border text-white placeholder-dash-muted focus:outline-none focus:ring-2 focus:ring-dash-accent focus:border-transparent text-base mb-6"
            />

            {/* Mobile filter toggle */}
            <button
                onClick={() => setShowFilters(!showFilters)}
                className="lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-lg bg-dash-surface border border-dash-border text-dash-muted hover:text-white transition-colors text-sm mb-4"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="8" y1="12" x2="20" y2="12" />
                    <line x1="12" y1="18" x2="20" y2="18" />
                </svg>
                Filters
                {activeFilterCount > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-dash-accent text-white text-xs font-medium">
                        {activeFilterCount}
                    </span>
                )}
            </button>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Sidebar */}
                <aside
                    className={`${showFilters ? "block" : "hidden"} lg:block w-full lg:w-56 shrink-0 bg-dash-surface/50 border border-dash-border rounded-lg p-4 lg:p-5 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto`}
                >
                    {/* TYPE section */}
                    <div className="mb-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-dash-muted mb-2">
                            Type
                        </h3>
                        <div className="space-y-0.5">
                            {TYPE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.label}
                                    onClick={() => setSelectedType(opt.value)}
                                    className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                                        selectedType === opt.value
                                            ? "bg-dash-accent/15 text-dash-accent font-medium"
                                            : "text-dash-muted hover:text-white hover:bg-white/5"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <hr className="border-dash-border my-4" />

                    {/* APP section */}
                    <div className="mb-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-dash-muted mb-2">
                            App
                        </h3>
                        <select
                            value={selectedAppOrigin}
                            onChange={(e) =>
                                setSelectedAppOrigin(e.target.value)
                            }
                            className="w-full px-3 py-1.5 rounded-md bg-dash-bg border border-dash-border text-white text-sm focus:outline-none focus:ring-2 focus:ring-dash-accent focus:border-transparent appearance-none cursor-pointer pr-8"
                            style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239ca3af' d='M3 5l3 3 3-3'/%3E%3C/svg%3E")`,
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "right 0.5rem center",
                            }}
                        >
                            <option value="">All Apps</option>
                            {appOrigins.map((origin) => (
                                <option key={origin} value={origin}>
                                    {origin}
                                </option>
                            ))}
                            {!appOrigins.includes("dash-electron") && (
                                <option value="dash-electron">
                                    dash-electron
                                </option>
                            )}
                        </select>
                    </div>

                    <hr className="border-dash-border my-4" />

                    {/* CATEGORY section */}
                    <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-dash-muted mb-2">
                            Category
                        </h3>
                        <CategoryFilter
                            categories={categories}
                            selected={selectedCategory}
                            onSelect={setSelectedCategory}
                            variant="vertical"
                        />
                    </div>
                </aside>

                {/* Results */}
                <div className="flex-1 min-w-0">
                    {results.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-dash-muted text-lg">
                                No packages found
                            </p>
                            <p className="text-dash-muted text-sm mt-1">
                                Try a different search term or category.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {results.map((pkg) => (
                                <PackageCard key={pkg.name} pkg={pkg} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
