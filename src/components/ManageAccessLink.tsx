"use client";

/**
 * Renders a "Manage Access" link on the package detail page — but only
 * for the package owner. Any other viewer (anon or non-owner signed in)
 * sees nothing.
 */
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";

interface Props {
    scope: string;
    name: string;
    ownerId: string;
}

export function ManageAccessLink({ scope, name, ownerId }: Props) {
    const { profile, isAuthenticated } = useAuth();
    if (!isAuthenticated || !profile) return null;
    if (profile.cognitoId !== ownerId) return null;

    return (
        <Link
            href={`/package/${scope}/${name}/access`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 transition-colors"
        >
            Manage access &rarr;
        </Link>
    );
}
