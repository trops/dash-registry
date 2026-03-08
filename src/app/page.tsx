import { SearchBar } from "@/components/SearchBar";
import type { Package } from "@/lib/registry";

export const dynamic = "force-dynamic";

async function fetchPackages(): Promise<{
    packages: Package[];
    categories: string[];
}> {
    const baseUrl = process.env.REGISTRY_BASE_URL || "http://localhost:3000";
    try {
        const res = await fetch(`${baseUrl}/api/packages`, {
            cache: "no-store",
        });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        const packages: Package[] = data.packages || [];
        const categories = Array.from(
            new Set(
                packages
                    .map((p: Package) => p.category)
                    .filter(Boolean) as string[],
            ),
        ).sort();
        return { packages, categories };
    } catch {
        // Fallback to static registry index if API is unavailable
        const { getAllPackages, getAllCategories } = await import(
            "@/lib/registry"
        );
        return {
            packages: getAllPackages(),
            categories: getAllCategories(),
        };
    }
}

export default async function HomePage() {
    const { packages, categories } = await fetchPackages();

    return (
        <div className="max-w-6xl mx-auto px-6 py-12">
            {/* Hero */}
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold text-white mb-3">
                    Dash Widget Registry
                </h1>
                <p className="text-lg text-dash-muted max-w-2xl mx-auto">
                    Discover and install widget packages for your Dash
                    dashboard. Browse community-contributed packages or publish
                    your own.
                </p>
            </div>

            {/* Search + Grid */}
            <SearchBar packages={packages} categories={categories} />
        </div>
    );
}
