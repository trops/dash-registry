import { SearchBar } from "@/components/SearchBar";
import type { Package } from "@/lib/registry";

export const dynamic = "force-dynamic";

async function fetchPackages(): Promise<{
    packages: Package[];
    categories: string[];
    appOrigins: string[];
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
        const appOrigins = Array.from(
            new Set(
                packages
                    .map((p: Package) => p.appOrigin)
                    .filter(Boolean) as string[],
            ),
        ).sort();
        return { packages, categories, appOrigins };
    } catch {
        // Fallback to static registry index if API is unavailable
        const { getAllPackages, getAllCategories } = await import(
            "@/lib/registry"
        );
        const packages = getAllPackages();
        const appOrigins = Array.from(
            new Set(
                packages
                    .map((p: Package) => p.appOrigin)
                    .filter(Boolean) as string[],
            ),
        ).sort();
        return {
            packages,
            categories: getAllCategories(),
            appOrigins,
        };
    }
}

export default async function HomePage() {
    const { packages, categories, appOrigins } = await fetchPackages();

    return (
        <div className="max-w-6xl mx-auto px-6 py-12">
            {/* Hero */}
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold text-white mb-3">
                    Dash Registry
                </h1>
                <p className="text-lg text-dash-muted max-w-2xl mx-auto">
                    Discover and install widgets and dashboards for your Dash
                    desktop app. Browse community-contributed packages or
                    publish your own.
                </p>
            </div>

            {/* Search + Grid */}
            <SearchBar
                packages={packages}
                categories={categories}
                appOrigins={appOrigins}
            />
        </div>
    );
}
