"use client";

interface CategoryFilterProps {
    categories: string[];
    selected: string | null;
    onSelect: (category: string | null) => void;
}

export function CategoryFilter({
    categories,
    selected,
    onSelect,
}: CategoryFilterProps) {
    return (
        <div className="flex flex-wrap gap-2">
            <button
                onClick={() => onSelect(null)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    selected === null
                        ? "bg-dash-accent text-white"
                        : "bg-dash-surface border border-dash-border text-dash-muted hover:text-white hover:border-dash-accent/50"
                }`}
            >
                All
            </button>
            {categories.map((category) => (
                <button
                    key={category}
                    onClick={() =>
                        onSelect(selected === category ? null : category)
                    }
                    className={`px-3 py-1.5 rounded-full text-sm capitalize transition-colors ${
                        selected === category
                            ? "bg-dash-accent text-white"
                            : "bg-dash-surface border border-dash-border text-dash-muted hover:text-white hover:border-dash-accent/50"
                    }`}
                >
                    {category}
                </button>
            ))}
        </div>
    );
}
