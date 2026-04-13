"use client";

/**
 * Renders a "Manage Access" link on the package detail page — only for
 * the package owner viewing their own private package. Public packages
 * don't have meaningful entitlements (anyone can install), so the link
 * is hidden even from the owner there to avoid confusion.
 */
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";

interface Props {
    scope: string;
    name: string;
    ownerId: string;
    visibility?: string;
}

export function ManageAccessLink({
    scope,
    name,
    ownerId,
    visibility,
}: Props) {
    const { profile, isAuthenticated } = useAuth();
    if (!isAuthenticated || !profile) return null;
    if (profile.cognitoId !== ownerId) return null;
    if (visibility !== "private") return null;

    return (
        <Link
            href={`/package/${scope}/${name}/access`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 transition-colors"
        >
            Manage access &rarr;
        </Link>
    );
}
