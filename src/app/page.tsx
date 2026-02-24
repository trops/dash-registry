import { getAllPackages, getAllCategories } from "@/lib/registry";
import { SearchBar } from "@/components/SearchBar";

export default function HomePage() {
    const packages = getAllPackages();
    const categories = getAllCategories();

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
