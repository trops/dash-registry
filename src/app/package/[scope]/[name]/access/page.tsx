"use client";

/**
 * /package/[scope]/[name]/access
 *
 * Owner-only access management page. Shows existing entitlements on this
 * package with revoke controls, plus a form to grant new entitlements
 * (by username for now; org grants come when orgs ship).
 *
 * Non-owners don't visit this URL in normal flow — there's a link/tab on
 * the package detail page that only renders for owners. If a non-owner
 * hits this URL directly, they see a "not found / not authorized" state.
 */
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";

interface GranteeDisplay {
    username: string;
    displayName?: string;
    avatarUrl?: string;
}

interface OrgDisplay {
    slug: string;
    name: string;
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
    claimedByUserId: string | null;
    claimedAt: string | null;
    revokedAt: string | null;
    // Enriched by the GET endpoint for display only.
    grantee?: GranteeDisplay | null;
    org?: OrgDisplay | null;
    claimedByUser?: GranteeDisplay | null;
}


interface PackageDetail {
    scope: string;
    name: string;
    displayName?: string;
    visibility?: string;
    ownerId?: string;
}

interface UserLookupResult {
    cognitoId: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
}

export default function AccessPage() {
    const { scope, name } = useParams<{ scope: string; name: string }>();
    const { profile, getAccessToken, isAuthenticated, isLoading } = useAuth();

    const [pkg, setPkg] = useState<PackageDetail | null>(null);
    const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [grantMode, setGrantMode] = useState<"email" | "org">("email");
    const [grantEmail, setGrantEmail] = useState("");
    const [grantOrgSlug, setGrantOrgSlug] = useState("");
    const [grantSeats, setGrantSeats] = useState<string>("");
    const [grantExpires, setGrantExpires] = useState<string>("");
    const [granting, setGranting] = useState(false);
    const [grantError, setGrantError] = useState<string | null>(null);
    const [grantSuccess, setGrantSuccess] = useState<string | null>(null);

    const isOwner = !!(
        pkg &&
        profile?.cognitoId &&
        pkg.ownerId === profile.cognitoId
    );

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
            const headers = { Authorization: `Bearer ${token}` };
            const [pkgRes, entRes] = await Promise.all([
                fetch(`/api/packages/${scope}/${name}`, { headers }),
                fetch(`/api/packages/${scope}/${name}/entitlements`, {
                    headers,
                }),
            ]);
            if (pkgRes.status === 404) {
                setError("Package not found or you don't have access");
                setLoading(false);
                return;
            }
            if (!pkgRes.ok) throw new Error(`Package fetch ${pkgRes.status}`);
            const pkgData = await pkgRes.json();
            setPkg(pkgData);

            if (entRes.ok) {
                const data = await entRes.json();
                setEntitlements(data.entitlements || []);
            } else if (entRes.status === 404) {
                // non-owner hit the page directly
                setError("Only the package owner can manage access");
            } else {
                throw new Error(`Entitlements fetch ${entRes.status}`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [scope, name, getAccessToken]);

    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            load();
        }
    }, [isLoading, isAuthenticated, load]);


    async function handleGrant(e: React.FormEvent) {
        e.preventDefault();
        setGrantError(null);
        setGrantSuccess(null);
        setGranting(true);
        const token = await getAccessToken();
        try {
            let body: Record<string, unknown>;
            let successMessage = "";

            if (grantMode === "org") {
                // Grant to an org by slug. Any authenticated owner can
                // grant to any existing org — the slug is the
                // identifier the recipient shares with the grantor
                // (like an email). Unknown slugs 404 with a helpful
                // hint pointing at the email-grant flow.
                const slug = grantOrgSlug.trim().toLowerCase();
                if (!slug) {
                    setGrantError("Organization slug required");
                    setGranting(false);
                    return;
                }
                const lookup = await fetch(
                    `/api/orgs/by-slug/${encodeURIComponent(slug)}?minimal`,
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                if (lookup.status === 404) {
                    setGrantError(
                        `Organization "${slug}" not found. If they haven't set up an org yet, grant to an individual email instead — they can join an org later.`,
                    );
                    setGranting(false);
                    return;
                }
                if (!lookup.ok)
                    throw new Error(`Lookup failed ${lookup.status}`);
                const data = await lookup.json();
                body = {
                    granteeType: "org",
                    granteeId: data.org.orgId,
                    source: "manual",
                };
                successMessage = `Granted access to ${data.org.name} (@${data.org.slug})`;
            } else {
                // Email path — resolve to an existing user if possible,
                // otherwise create an email-pending grant.
                const email = grantEmail.trim().toLowerCase();
                if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                    setGrantError("Valid email address required");
                    setGranting(false);
                    return;
                }
                const lookup = await fetch(
                    `/api/users/lookup?email=${encodeURIComponent(email)}`,
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                if (lookup.ok) {
                    const user: UserLookupResult = await lookup.json();
                    body = {
                        granteeType: "user",
                        granteeId: user.cognitoId,
                        source: "manual",
                    };
                    successMessage = `Granted access to ${user.displayName || user.username}`;
                } else if (lookup.status === 404) {
                    body = {
                        granteeType: "email",
                        granteeId: email,
                        source: "invite",
                    };
                    successMessage = `Invited ${email} — access activates when they sign up and verify this email.`;
                } else {
                    throw new Error(`Lookup failed ${lookup.status}`);
                }
            }

            const seatsNum = grantSeats.trim() ? Number(grantSeats) : null;
            if (seatsNum && seatsNum > 0) body.seats = seatsNum;
            if (grantExpires) body.expiresAt = new Date(grantExpires).toISOString();

            const grant = await fetch(
                `/api/packages/${scope}/${name}/entitlements`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                },
            );
            if (!grant.ok) {
                const err = await grant.json().catch(() => ({}));
                throw new Error(err.error || `Grant failed ${grant.status}`);
            }

            setGrantSuccess(successMessage);
            setGrantEmail("");
            setGrantOrgSlug("");
            setGrantSeats("");
            setGrantExpires("");
            await load();
        } catch (err) {
            setGrantError(err instanceof Error ? err.message : "Grant failed");
        } finally {
            setGranting(false);
        }
    }

    async function handleRevoke(entitlementId: string) {
        if (!confirm("Revoke this entitlement? The user will lose access.")) return;
        const token = await getAccessToken();
        const res = await fetch(`/api/entitlements/${entitlementId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            await load();
        } else {
            alert(`Revoke failed: ${res.status}`);
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
                <h1 className="text-2xl font-semibold mb-2">Access Management</h1>
                <p className="text-gray-400 mb-4">
                    You need to be signed in to manage package access.
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
                <div className="mb-6">
                    <Link
                        href={`/package/${scope}/${name}`}
                        className="text-sm text-dash-accent hover:underline"
                    >
                        &larr; Back to package
                    </Link>
                </div>
                <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-4 text-red-300">
                    {error}
                </div>
            </div>
        );
    }

    if (!isOwner) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-12">
                <div className="mb-6">
                    <Link
                        href={`/package/${scope}/${name}`}
                        className="text-sm text-dash-accent hover:underline"
                    >
                        &larr; Back to package
                    </Link>
                </div>
                <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-lg p-4 text-yellow-300">
                    Only the package owner can manage access for this package.
                </div>
            </div>
        );
    }

    const active = entitlements.filter((e) => !e.revokedAt);

    return (
        <div className="max-w-3xl mx-auto px-6 py-12">
            <div className="mb-6">
                <Link
                    href={`/package/${scope}/${name}`}
                    className="text-sm text-dash-accent hover:underline"
                >
                    &larr; Back to {pkg?.displayName || `${scope}/${name}`}
                </Link>
            </div>

            <h1 className="text-2xl font-semibold mb-1">Manage Access</h1>
            <p className="text-gray-400 text-sm mb-8">
                {pkg?.displayName || `${scope}/${name}`} &middot;{" "}
                <span
                    className={
                        pkg?.visibility === "private"
                            ? "text-amber-400"
                            : "text-emerald-400"
                    }
                >
                    {pkg?.visibility || "public"}
                </span>
            </p>

            {pkg?.visibility !== "private" && (
                <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg p-4 mb-6 text-sm text-blue-200">
                    This package is <strong>public</strong> — anyone can install
                    it without an entitlement. Entitlements only take effect
                    when you change visibility to private.
                </div>
            )}

            {/* Grant form */}
            <section className="bg-gray-900/40 border border-gray-800 rounded-lg p-5 mb-8">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-4">
                    Grant access
                </h2>
                <form onSubmit={handleGrant} className="space-y-4">
                    {/* Mode toggle: individual email vs org */}
                    <div className="flex items-center gap-1 bg-gray-800/60 rounded p-1 w-fit">
                        {(["email", "org"] as const).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => setGrantMode(mode)}
                                disabled={granting}
                                className={`px-3 py-1 text-xs rounded transition-colors ${
                                    grantMode === mode
                                        ? "bg-indigo-600 text-white"
                                        : "text-gray-400 hover:text-gray-200"
                                }`}
                            >
                                {mode === "email" ? "Individual" : "Organization"}
                            </button>
                        ))}
                    </div>

                    {grantMode === "email" ? (
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                value={grantEmail}
                                onChange={(e) => setGrantEmail(e.target.value)}
                                placeholder="alice@example.com"
                                disabled={granting}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                If they&apos;re already registered, access
                                activates immediately. If not, the grant
                                waits and activates when they sign up with
                                this email.
                            </p>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">
                                Organization slug
                            </label>
                            <input
                                type="text"
                                value={grantOrgSlug}
                                onChange={(e) =>
                                    setGrantOrgSlug(e.target.value)
                                }
                                placeholder="acme-engineering"
                                disabled={granting}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                The URL-safe slug the organization uses
                                (e.g. `acme-engineering`). All current and
                                future members get access. If the org
                                doesn&apos;t exist yet, grant to an
                                individual email instead and they can join
                                an org later.
                            </p>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">
                                Seat limit (optional)
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={grantSeats}
                                onChange={(e) => setGrantSeats(e.target.value)}
                                placeholder="unlimited"
                                disabled={granting}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">
                                Expires (optional)
                            </label>
                            <input
                                type="date"
                                value={grantExpires}
                                onChange={(e) =>
                                    setGrantExpires(e.target.value)
                                }
                                disabled={granting}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    </div>
                    {grantError && (
                        <div className="text-sm text-red-400">{grantError}</div>
                    )}
                    {grantSuccess && (
                        <div className="text-sm text-emerald-400">
                            {grantSuccess}
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={
                            granting ||
                            (grantMode === "email" && !grantEmail.trim()) ||
                            (grantMode === "org" && !grantOrgSlug.trim())
                        }
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-white text-sm font-medium transition-colors"
                    >
                        {granting ? "Granting..." : "Grant access"}
                    </button>
                </form>
            </section>

            {/* Existing entitlements */}
            <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-4">
                    Active entitlements ({active.length})
                </h2>
                {active.length === 0 ? (
                    <div className="text-sm text-gray-500 bg-gray-900/40 border border-gray-800 rounded-lg p-5 text-center">
                        No one else has access yet. Grant access above.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {active.map((e) => (
                            <EntitlementRow
                                key={e.entitlementId}
                                entitlement={e}
                                onRevoke={handleRevoke}
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function EntitlementRow({
    entitlement: e,
    onRevoke,
}: {
    entitlement: Entitlement;
    onRevoke: (id: string) => void;
}) {
    const isPending = e.granteeType === "email";
    const isUser = e.granteeType === "user";
    const isOrg = e.granteeType === "org";
    const g = e.grantee;
    const org = e.org;
    // Prefer human-friendly labels: displayName → @username → email (for
    // pending) → org name → raw id (fallback).
    const primaryLabel = isUser
        ? g?.displayName || (g ? `@${g.username}` : e.granteeId)
        : isOrg
        ? org?.name || e.granteeId
        : e.granteeId;
    const secondaryLabel = isUser && g?.displayName
        ? `@${g.username}`
        : isOrg && org
        ? `@${org.slug}`
        : null;

    return (
        <div className="flex items-center justify-between bg-gray-900/40 border border-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                {isUser && g?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={g.avatarUrl}
                        alt=""
                        className="w-8 h-8 rounded-full flex-shrink-0"
                    />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                        {isPending
                            ? "@"
                            : isOrg
                            ? (org?.name || "O").slice(0, 1).toUpperCase()
                            : "\u00B7"}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm text-gray-200">
                        <span
                            className={`text-xs uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                isPending
                                    ? "text-amber-400 bg-amber-900/30"
                                    : isOrg
                                    ? "text-purple-300 bg-purple-900/30"
                                    : "text-gray-500 bg-gray-800"
                            }`}
                        >
                            {isPending ? "pending invite" : e.granteeType}
                        </span>
                        <span className="text-sm truncate">{primaryLabel}</span>
                        {secondaryLabel && (
                            <span className="text-xs text-gray-500 truncate">
                                {secondaryLabel}
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                        {isPending && (
                            <span className="text-amber-500/80">
                                Activates when they sign up and verify this
                                email
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
                        <span>source: {e.source}</span>
                    </div>
                </div>
            </div>
            <button
                onClick={() => onRevoke(e.entitlementId)}
                className="ml-3 px-2.5 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
            >
                Revoke
            </button>
        </div>
    );
}
