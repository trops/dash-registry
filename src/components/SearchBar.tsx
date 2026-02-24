"use client";

import { useState, useEffect, useMemo } from "react";
import Fuse from "fuse.js";
import type { Package } from "@/lib/registry";
import { createSearchIndex, searchPackages } from "@/lib/search";
import { PackageCard } from "./PackageCard";
import { CategoryFilter } from "./CategoryFilter";

interface SearchBarProps {
    packages: Package[];
    categories: string[];
}

export function SearchBar({ packages, categories }: SearchBarProps) {
    const [query, setQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(
        null
    );
    const [results, setResults] = useState<Package[]>(packages);

    const fuse = useMemo(() => createSearchIndex(packages), [packages]);

    useEffect(() => {
        let filtered: Package[];

        if (query.trim()) {
            filtered = searchPackages(fuse, query, packages);
        } else {
            filtered = packages;
        }

        if (selectedCategory) {
            filtered = filtered.filter(
                (pkg) => pkg.category === selectedCategory
            );
        }

        setResults(filtered);
    }, [query, selectedCategory, fuse, packages]);

    return (
        <div>
            {/* Search Input */}
            <div className="mb-6">
                <input
                    type="text"
                    placeholder="Search packages, widgets, tags..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-dash-surface border border-dash-border text-white placeholder-dash-muted focus:outline-none focus:ring-2 focus:ring-dash-accent focus:border-transparent text-base"
                />
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
