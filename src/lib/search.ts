import Fuse, { IFuseOptions } from "fuse.js";
import type { Package } from "./registry";

const fuseOptions: IFuseOptions<Package> = {
    keys: [
        { name: "name", weight: 2 },
        { name: "displayName", weight: 2 },
        { name: "description", weight: 1 },
        { name: "author", weight: 1.5 },
        { name: "tags", weight: 1.5 },
        { name: "widgets.name", weight: 1 },
        { name: "widgets.displayName", weight: 1 },
        { name: "widgets.description", weight: 0.5 },
    ],
    threshold: 0.4,
    includeScore: true,
};

export function createSearchIndex(packages: Package[]): Fuse<Package> {
    return new Fuse(packages, fuseOptions);
}

export function searchPackages(
    fuse: Fuse<Package>,
    query: string,
    allPackages: Package[]
): Package[] {
    if (!query.trim()) return allPackages;
    return fuse.search(query).map((result) => result.item);
}
