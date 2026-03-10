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

    const fuse = useMemo(() => createSearchIndex(packages), [packages]);

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
            {/* Search Input */}
            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Search packages, widgets, tags..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-dash-surface border border-dash-border text-white placeholder-dash-muted focus:outline-none focus:ring-2 focus:ring-dash-accent focus:border-transparent text-base"
                />
            </div>

            {/* Type Segmented Control + App Dropdown */}
            <div className="flex items-center justify-between mb-4">
                <div className="inline-flex rounded-lg border border-dash-border overflow-hidden">
                    {TYPE_OPTIONS.map((opt) => (
                        <button
                            key={opt.label}
                            onClick={() => setSelectedType(opt.value)}
                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                                selectedType === opt.value
                                    ? "bg-dash-accent text-white"
                                    : "bg-dash-surface text-dash-muted hover:text-white"
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm text-dash-muted">
                        Compatible with
                    </span>
                    <select
                        value={selectedAppOrigin}
                        onChange={(e) => setSelectedAppOrigin(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-dash-surface border border-dash-border text-white text-sm focus:outline-none focus:ring-2 focus:ring-dash-accent focus:border-transparent appearance-none cursor-pointer pr-8"
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
                            <option value="dash-electron">dash-electron</option>
                        )}
                    </select>
                </div>
            </div>

            {/* Category Filter */}
            <CategoryFilter
                categories={categories}
                selected={selectedCategory}
                onSelect={setSelectedCategory}
            />

            {/* Results */}
            <div className="mt-6">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {results.map((pkg) => (
                            <PackageCard key={pkg.name} pkg={pkg} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
