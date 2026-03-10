"use client";

interface CategoryFilterProps {
    categories: string[];
    selected: string | null;
    onSelect: (category: string | null) => void;
    variant?: "horizontal" | "vertical";
}

export function CategoryFilter({
    categories,
    selected,
    onSelect,
    variant = "horizontal",
}: CategoryFilterProps) {
    if (variant === "vertical") {
        return (
            <div className="space-y-0.5">
                <button
                    onClick={() => onSelect(null)}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                        selected === null
                            ? "bg-dash-accent/15 text-dash-accent font-medium"
                            : "text-dash-muted hover:text-white hover:bg-white/5"
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
                        className={`w-full text-left px-3 py-1.5 rounded-md text-sm capitalize transition-colors ${
                            selected === category
                                ? "bg-dash-accent/15 text-dash-accent font-medium"
                                : "text-dash-muted hover:text-white hover:bg-white/5"
                        }`}
                    >
                        {category}
                    </button>
                ))}
            </div>
        );
    }

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
