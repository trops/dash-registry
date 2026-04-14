"use client";

/**
 * /account/licenses
 *
 * "My Licenses" — shows every private package the signed-in user has
 * access to, grouped by how they get access:
 *
 *   - Direct grants (a package owner invited me by email or user)
 *   - Through an organization I'm a member of
 *   - Pending email invites (matching my verified email, not yet claimed)
 *
 * Public packages aren't listed here — anyone can install those, no
 * entitlement needed. This page is about answering "what can I install
 * that isn't public?"
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";

interface ViaOrg {
    orgId: string;
    slug: string;
    name: string;
}

interface PackageInfo {
    scope: string;
    name: string;
    displayName: string;
    description: string;
    visibility: string;
    icon?: string;
}

interface Entitlement {
    entitlementId: string;
    packageScope: string;
    packageName: string;
    versionConstraint: string;
    granteeType: "user" | "org" | "email";
    granteeId: string;
    seats: number | null;
    activeSeats: number;
    expiresAt: string | null;
    source: string;
    createdAt: string;
    via: "user" | "org" | "email";
    viaOrg?: ViaOrg;
    package: PackageInfo;
}

export default function LicensesPage() {
    const { getAccessToken, isAuthenticated, isLoading } = useAuth();
    const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
            const res = await fetch("/api/me/entitlements", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setEntitlements(data.entitlements || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Load failed");
        } finally {
            setLoading(false);
        }
    }, [getAccessToken]);

    useEffect(() => {
        if (!isLoading && isAuthenticated) load();
    }, [isLoading, isAuthenticated, load]);

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
                <h1 className="text-2xl font-semibold mb-2">My Licenses</h1>
                <p className="text-gray-400 mb-4">
                    Sign in to see the private packages you&apos;ve been
                    granted access to.
                </p>
                <Link
                    href="/account"
                    className="text-dash-accent hover:underline"
                >
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

    const direct = entitlements.filter((e) => e.via === "user");
    const viaOrg = entitlements.filter((e) => e.via === "org");
    const pending = entitlements.filter((e) => e.via === "email");

    return (
        <div className="max-w-3xl mx-auto px-6 py-12">
            <div className="mb-8">
                <h1 className="text-2xl font-semibold mb-1">My Licenses</h1>
                <p className="text-sm text-gray-400">
                    Private packages you&apos;ve been granted access to.
                    Public packages are always installable and not listed
                    here.
                </p>
            </div>

            {entitlements.length === 0 && (
                <div className="text-sm text-gray-500 bg-gray-900/40 border border-gray-800 rounded-lg p-6 text-center">
                    You don&apos;t have access to any private packages yet.
                    Ask a package owner to grant you access by email, or{" "}
                    <Link
                        href="/orgs"
                        className="text-indigo-400 hover:underline"
                    >
                        join an organization
                    </Link>
                    .
                </div>
            )}

            <Section
                title="Granted directly to you"
                subtitle="Entitlements a package owner granted to your email or account."
                entitlements={direct}
            />
            <Section
                title="Through an organization"
                subtitle="Entitlements granted to an org you're a member of."
                entitlements={viaOrg}
            />
            <Section
                title="Pending (matches your verified email)"
                subtitle="Invites waiting for your email to be linked. These work now — the entitlement activates on your next sign-in."
                entitlements={pending}
                pending
            />
        </div>
    );
}

function Section({
    title,
    subtitle,
    entitlements,
    pending,
}: {
    title: string;
    subtitle: string;
    entitlements: Entitlement[];
    pending?: boolean;
}) {
    if (entitlements.length === 0) return null;
    return (
        <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
                {title}
            </h2>
            <p className="text-xs text-gray-500 mb-3">{subtitle}</p>
            <div className="space-y-2">
                {entitlements.map((e) => (
                    <LicenseRow
                        key={e.entitlementId}
                        entitlement={e}
                        pending={pending}
                    />
                ))}
            </div>
        </section>
    );
}

function LicenseRow({
    entitlement: e,
    pending,
}: {
    entitlement: Entitlement;
    pending?: boolean;
}) {
    const pkgHref = `/package/${e.package.scope}/${e.package.name}`;
    return (
        <Link
            href={pkgHref}
            className="block bg-gray-900/40 border border-gray-800 hover:border-gray-600 rounded-lg p-4 transition-colors"
        >
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center text-sm text-gray-400 flex-shrink-0">
                    {(e.package.displayName || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-100 truncate">
                            {e.package.displayName}
                        </span>
                        {pending && (
                            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400">
                                pending
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                        @{e.package.scope}/{e.package.name}
                    </div>
                    {e.package.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                            {e.package.description}
                        </p>
                    )}
                    <div className="text-[10px] text-gray-500 mt-2 flex items-center gap-2 flex-wrap">
                        {e.viaOrg && (
                            <span>
                                via org{" "}
                                <span className="text-purple-300">
                                    @{e.viaOrg.slug}
                                </span>
                            </span>
                        )}
                        <span>
                            seats:{" "}
                            {e.seats == null
                                ? "unlimited"
                                : `${e.activeSeats}/${e.seats}`}
                        </span>
                        <span>
                            expires:{" "}
                            {e.expiresAt
                                ? new Date(e.expiresAt).toLocaleDateString()
                                : "never"}
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    );
}
