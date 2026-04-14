"use client";

/**
 * /orgs
 *
 * Lists the orgs the signed-in user is a member of, plus a form to
 * create a new one. Creating an org makes the creator the owner
 * automatically (see lib/orgs.createOrg).
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";

interface Org {
    orgId: string;
    slug: string;
    name: string;
    ownerUserId: string;
    createdAt: string;
}

interface Membership {
    orgId: string;
    userId: string;
    role: "owner" | "admin" | "member";
    joinedAt: string;
}

interface OrgListItem {
    org: Org;
    membership: Membership;
}

export default function OrgsListPage() {
    const { getAccessToken, isAuthenticated, isLoading } = useAuth();

    const [orgs, setOrgs] = useState<OrgListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [newSlug, setNewSlug] = useState("");
    const [newName, setNewName] = useState("");
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        const token = await getAccessToken();
        if (!token) {
            setError("Sign in required");
            setLoading(false);
            return;
        }
        try {
            const res = await fetch("/api/orgs", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setOrgs(data.orgs || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Load failed");
        } finally {
            setLoading(false);
        }
    }, [getAccessToken]);

    useEffect(() => {
        if (!isLoading && isAuthenticated) load();
    }, [isLoading, isAuthenticated, load]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setCreateError(null);
        if (!newSlug.trim() || !newName.trim()) {
            setCreateError("Slug and name are required");
            return;
        }
        setCreating(true);
        const token = await getAccessToken();
        try {
            const res = await fetch("/api/orgs", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    slug: newSlug.trim().toLowerCase(),
                    name: newName.trim(),
                }),
            });
            const body = await res.json();
            if (!res.ok) {
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            setShowCreate(false);
            setNewSlug("");
            setNewName("");
            await load();
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : "Create failed");
        } finally {
            setCreating(false);
        }
    }

    if (isLoading || loading) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-12">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-12">
                <h1 className="text-2xl font-semibold mb-2">Organizations</h1>
                <p className="text-gray-400 mb-4">
                    Sign in to manage organizations.
                </p>
                <Link href="/account" className="text-dash-accent hover:underline">
                    Sign in &rarr;
                </Link>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-12">
                <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-4 text-red-300">
                    {error}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-6 py-12">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold">Organizations</h1>
                    <p className="text-sm text-gray-400 mt-1">
                        Group users to grant them access to private packages
                        collectively.
                    </p>
                </div>
                {!showCreate && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-white text-sm font-medium"
                    >
                        + Create org
                    </button>
                )}
            </div>

            {showCreate && (
                <section className="bg-gray-900/40 border border-gray-800 rounded-lg p-5 mb-8">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-4">
                        Create organization
                    </h2>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">
                                Slug
                            </label>
                            <input
                                type="text"
                                value={newSlug}
                                onChange={(e) => setNewSlug(e.target.value)}
                                placeholder="acme"
                                disabled={creating}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                URL-safe identifier. Lowercase letters, digits,
                                hyphens; 3–40 chars.
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">
                                Name
                            </label>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Acme Corp"
                                disabled={creating}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        {createError && (
                            <div className="text-sm text-red-400">{createError}</div>
                        )}
                        <div className="flex items-center gap-2">
                            <button
                                type="submit"
                                disabled={creating}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded text-white text-sm font-medium"
                            >
                                {creating ? "Creating..." : "Create"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowCreate(false);
                                    setCreateError(null);
                                }}
                                className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {orgs.length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-900/40 border border-gray-800 rounded-lg p-6 text-center">
                    You&apos;re not a member of any organizations yet.
                </div>
            ) : (
                <div className="space-y-2">
                    {orgs.map(({ org, membership }) => (
                        <Link
                            key={org.orgId}
                            href={`/orgs/${org.slug}`}
                            className="block bg-gray-900/40 border border-gray-800 hover:border-gray-600 rounded-lg p-4 transition-colors"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-medium text-gray-100">
                                        {org.name}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        @{org.slug}
                                    </div>
                                </div>
                                <span
                                    className={`text-xs uppercase tracking-wide px-2 py-0.5 rounded ${
                                        membership.role === "owner"
                                            ? "bg-indigo-900/40 text-indigo-300"
                                            : membership.role === "admin"
                                              ? "bg-purple-900/40 text-purple-300"
                                              : "bg-gray-800 text-gray-400"
                                    }`}
                                >
                                    {membership.role}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
