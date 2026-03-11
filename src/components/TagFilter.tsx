"use client";

interface TagFilterProps {
  tags: string[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
  variant?: "horizontal" | "vertical";
}

export function TagFilter({
  tags,
  selected,
  onSelect,
  variant = "horizontal",
}: TagFilterProps) {
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
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => onSelect(selected === tag ? null : tag)}
            className={`w-full text-left px-3 py-1.5 rounded-md text-sm capitalize transition-colors ${
              selected === tag
                ? "bg-dash-accent/15 text-dash-accent font-medium"
                : "text-dash-muted hover:text-white hover:bg-white/5"
            }`}
          >
            {tag}
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
      {tags.map((tag) => (
        <button
          key={tag}
          onClick={() => onSelect(selected === tag ? null : tag)}
          className={`px-3 py-1.5 rounded-full text-sm capitalize transition-colors ${
            selected === tag
              ? "bg-dash-accent text-white"
              : "bg-dash-surface border border-dash-border text-dash-muted hover:text-white hover:border-dash-accent/50"
          }`}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
