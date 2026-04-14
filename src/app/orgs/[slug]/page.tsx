"use client";

/**
 * /orgs/[slug]
 *
 * Org detail page — member list + invite form. Admins can invite new
 * members by email (existing registered users only); any member can view
 * the member list.
 *
 * The slug is resolved to an orgId via /api/orgs/by-slug/[slug], which
 * 404s for non-members so the URL is unguessable.
 */
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";

interface Org {
    orgId: string;
    slug: string;
    name: string;
    ownerUserId: string;
    createdAt: string;
}

interface MemberUser {
    username: string;
    displayName?: string;
    avatarUrl?: string;
}

interface Member {
    orgId: string;
    userId: string;
    role: "owner" | "admin" | "member";
    joinedAt: string;
    user: MemberUser | null;
}

interface OrgDomain {
    orgId: string;
    domain: string;
    verificationToken: string;
    verifiedAt: string | null;
    createdAt: string;
}

export default function OrgDetailPage() {
    const { slug } = useParams<{ slug: string }>();
    const { profile, getAccessToken, isAuthenticated, isLoading } = useAuth();

    const [org, setOrg] = useState<Org | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
    const [inviting, setInviting] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

    const [domains, setDomains] = useState<OrgDomain[]>([]);
    const [newDomain, setNewDomain] = useState("");
    const [addingDomain, setAddingDomain] = useState(false);
    const [domainError, setDomainError] = useState<string | null>(null);
    const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);
    const [verifyError, setVerifyError] = useState<{
        domain: string;
        message: string;
    } | null>(null);

    const myRole =
        profile?.cognitoId
            ? members.find((m) => m.userId === profile.cognitoId)?.role
            : undefined;
    const canInvite = myRole === "owner" || myRole === "admin";

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
            const orgRes = await fetch(`/api/orgs/by-slug/${slug}`, { headers });
            if (orgRes.status === 404) {
                setError("Organization not found or you're not a member");
                setLoading(false);
                return;
            }
            if (!orgRes.ok) throw new Error(`Org fetch ${orgRes.status}`);
            const orgData = await orgRes.json();
            setOrg(orgData.org);

            const [memRes, domRes] = await Promise.all([
                fetch(`/api/orgs/${orgData.org.orgId}/members`, { headers }),
                fetch(`/api/orgs/${orgData.org.orgId}/domains`, { headers }),
            ]);
            if (!memRes.ok) throw new Error(`Members fetch ${memRes.status}`);
            const memData = await memRes.json();
            setMembers(memData.members || []);
            if (domRes.ok) {
                const domData = await domRes.json();
                setDomains(domData.domains || []);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Load failed");
        } finally {
            setLoading(false);
        }
    }, [slug, getAccessToken]);

    useEffect(() => {
        if (!isLoading && isAuthenticated) load();
    }, [isLoading, isAuthenticated, load]);

    async function handleInvite(e: React.FormEvent) {
        e.preventDefault();
        setInviteError(null);
        setInviteSuccess(null);
        const email = inviteEmail.trim().toLowerCase();
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            setInviteError("Valid email address required");
            return;
        }
        if (!org) return;
        setInviting(true);
        const token = await getAccessToken();
        try {
            const res = await fetch(`/api/orgs/${org.orgId}/members`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, role: inviteRole }),
            });
            const body = await res.json();
            if (!res.ok) {
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            setInviteSuccess(`Added ${email} as ${inviteRole}`);
            setInviteEmail("");
            await load();
        } catch (err) {
            setInviteError(err instanceof Error ? err.message : "Invite failed");
        } finally {
            setInviting(false);
        }
    }

    async function handleRemove(userId: string, username: string) {
        if (
            !confirm(
                `Remove @${username} from ${org?.name}? They'll lose access to any packages granted through this org.`,
            )
        )
            return;
        if (!org) return;
        const token = await getAccessToken();
        const res = await fetch(
            `/api/orgs/${org.orgId}/members/${encodeURIComponent(userId)}`,
            {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            },
        );
        if (res.ok) {
            await load();
        } else {
            const body = await res.json().catch(() => ({}));
            alert(body.error || `Remove failed (${res.status})`);
        }
    }

    async function handleAddDomain(e: React.FormEvent) {
        e.preventDefault();
        setDomainError(null);
        const domain = newDomain.trim().toLowerCase();
        if (!domain || !domain.includes(".")) {
            setDomainError("Enter a bare domain, e.g. algolia.com");
            return;
        }
        if (!org) return;
        setAddingDomain(true);
        const token = await getAccessToken();
        try {
            const res = await fetch(`/api/orgs/${org.orgId}/domains`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ domain }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
            setNewDomain("");
            await load();
        } catch (err) {
            setDomainError(err instanceof Error ? err.message : "Failed to add domain");
        } finally {
            setAddingDomain(false);
        }
    }

    async function handleVerifyDomain(domain: string) {
        if (!org) return;
        setVerifyingDomain(domain);
        setVerifyError(null);
        const token = await getAccessToken();
        try {
            const res = await fetch(
                `/api/orgs/${org.orgId}/domains/${encodeURIComponent(domain)}/verify`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                },
            );
            const body = await res.json();
            if (!res.ok) {
                setVerifyError({
                    domain,
                    message:
                        body.hint ||
                        body.error ||
                        `Verification failed (${res.status})`,
                });
                return;
            }
            await load();
        } catch (err) {
            setVerifyError({
                domain,
                message: err instanceof Error ? err.message : "Verify failed",
            });
        } finally {
            setVerifyingDomain(null);
        }
    }

    async function handleDeleteDomain(domain: string) {
        if (!confirm(`Remove ${domain} from this org? Members whose email matches this domain will lose implicit access.`)) return;
        if (!org) return;
        const token = await getAccessToken();
        const res = await fetch(
            `/api/orgs/${org.orgId}/domains/${encodeURIComponent(domain)}`,
            {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            },
        );
        if (res.ok) await load();
        else alert(`Remove failed (${res.status})`);
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
                <p className="text-gray-400 mb-4">
                    Sign in to view this organization.
                </p>
                <Link href="/account" className="text-dash-accent hover:underline">
                    Sign in &rarr;
                </Link>
            </div>
        );
    }

    if (error || !org) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-12">
                <div className="mb-6">
                    <Link
                        href="/orgs"
                        className="text-sm text-dash-accent hover:underline"
                    >
                        &larr; Organizations
                    </Link>
                </div>
                <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-4 text-red-300">
                    {error || "Org not found"}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-6 py-12">
            <div className="mb-6">
                <Link
                    href="/orgs"
                    className="text-sm text-dash-accent hover:underline"
                >
                    &larr; Organizations
                </Link>
            </div>

            <h1 className="text-2xl font-semibold mb-1">{org.name}</h1>
            <p className="text-gray-400 text-sm mb-8">
                @{org.slug} &middot;{" "}
                {members.length} member{members.length === 1 ? "" : "s"}
            </p>

            {canInvite && (
                <section className="bg-gray-900/40 border border-gray-800 rounded-lg p-5 mb-8">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-4">
                        Add member
                    </h2>
                    <form onSubmit={handleInvite} className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <label className="block text-sm text-gray-300 mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="alice@example.com"
                                    disabled={inviting}
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">
                                    Role
                                </label>
                                <select
                                    value={inviteRole}
                                    onChange={(e) =>
                                        setInviteRole(
                                            e.target.value as "member" | "admin",
                                        )
                                    }
                                    disabled={inviting}
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="member">member</option>
                                    <option value="admin">admin</option>
                                </select>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500">
                            Member must be a registered dash-registry user. If
                            they haven&apos;t signed up yet, use a package-level
                            email invite instead.
                        </p>
                        {inviteError && (
                            <div className="text-sm text-red-400">{inviteError}</div>
                        )}
                        {inviteSuccess && (
                            <div className="text-sm text-emerald-400">
                                {inviteSuccess}
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={inviting || !inviteEmail.trim()}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded text-white text-sm font-medium"
                        >
                            {inviting ? "Adding..." : "Add member"}
                        </button>
                    </form>
                </section>
            )}

            <section className="mb-8">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    Verified domains
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                    Users whose verified email matches a domain below are
                    treated as implicit org members — any package granted
                    to this org covers them automatically, even without
                    explicit membership.
                </p>

                {canInvite && (
                    <form
                        onSubmit={handleAddDomain}
                        className="flex items-start gap-2 mb-4"
                    >
                        <div className="flex-1">
                            <input
                                type="text"
                                value={newDomain}
                                onChange={(e) => setNewDomain(e.target.value)}
                                placeholder="algolia.com"
                                disabled={addingDomain}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-indigo-500"
                            />
                            {domainError && (
                                <div className="text-xs text-red-400 mt-1">
                                    {domainError}
                                </div>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={addingDomain || !newDomain.trim()}
                            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded text-white text-sm font-medium"
                        >
                            {addingDomain ? "Adding..." : "Claim"}
                        </button>
                    </form>
                )}

                {domains.length === 0 ? (
                    <div className="text-xs text-gray-500 bg-gray-900/40 border border-gray-800 rounded-lg p-4 text-center">
                        No domains claimed yet.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {domains.map((d) => (
                            <DomainRow
                                key={d.domain}
                                record={d}
                                canManage={canInvite}
                                verifying={verifyingDomain === d.domain}
                                verifyError={
                                    verifyError?.domain === d.domain
                                        ? verifyError.message
                                        : null
                                }
                                onVerify={handleVerifyDomain}
                                onDelete={handleDeleteDomain}
                            />
                        ))}
                    </div>
                )}
            </section>

            <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-4">
                    Members ({members.length})
                </h2>
                <div className="space-y-2">
                    {members.map((m) => (
                        <MemberRow
                            key={m.userId}
                            member={m}
                            canRemove={canInvite && m.role !== "owner"}
                            onRemove={handleRemove}
                        />
                    ))}
                </div>
            </section>
        </div>
    );
}

function MemberRow({
    member: m,
    canRemove,
    onRemove,
}: {
    member: Member;
    canRemove: boolean;
    onRemove: (userId: string, username: string) => void;
}) {
    const u = m.user;
    const primary = u?.displayName || (u ? `@${u.username}` : m.userId);
    const secondary = u?.displayName ? `@${u.username}` : null;
    return (
        <div className="flex items-center justify-between bg-gray-900/40 border border-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                {u?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={u.avatarUrl}
                        alt=""
                        className="w-8 h-8 rounded-full flex-shrink-0"
                    />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                        {(u?.username || "?").slice(0, 1).toUpperCase()}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm text-gray-200">
                        <span className="truncate">{primary}</span>
                        {secondary && (
                            <span className="text-xs text-gray-500 truncate">
                                {secondary}
                            </span>
                        )}
                        <span
                            className={`text-xs uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                m.role === "owner"
                                    ? "bg-indigo-900/40 text-indigo-300"
                                    : m.role === "admin"
                                      ? "bg-purple-900/40 text-purple-300"
                                      : "bg-gray-800 text-gray-400"
                            }`}
                        >
                            {m.role}
                        </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                        Joined {new Date(m.joinedAt).toLocaleDateString()}
                    </div>
                </div>
            </div>
            {canRemove && (
                <button
                    onClick={() => onRemove(m.userId, u?.username || "member")}
                    className="ml-3 px-2.5 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                >
                    Remove
                </button>
            )}
        </div>
    );
}

function DomainRow({
    record: d,
    canManage,
    verifying,
    verifyError,
    onVerify,
    onDelete,
}: {
    record: OrgDomain;
    canManage: boolean;
    verifying: boolean;
    verifyError: string | null;
    onVerify: (domain: string) => void;
    onDelete: (domain: string) => void;
}) {
    const isVerified = !!d.verifiedAt;
    return (
        <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm text-gray-100 truncate">
                        {d.domain}
                    </span>
                    <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            isVerified
                                ? "bg-emerald-900/30 text-emerald-300"
                                : "bg-amber-900/30 text-amber-300"
                        }`}
                    >
                        {isVerified ? "verified" : "pending"}
                    </span>
                </div>
                {canManage && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {!isVerified && (
                            <button
                                onClick={() => onVerify(d.domain)}
                                disabled={verifying}
                                className="px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded text-white"
                            >
                                {verifying ? "Checking DNS..." : "Verify"}
                            </button>
                        )}
                        <button
                            onClick={() => onDelete(d.domain)}
                            className="px-2.5 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded"
                        >
                            Remove
                        </button>
                    </div>
                )}
            </div>
            {!isVerified && canManage && (
                <div className="mt-3 text-xs text-gray-400 bg-gray-950/60 border border-gray-800 rounded p-3">
                    <div className="mb-1 text-gray-300">
                        Add this TXT record at your DNS provider:
                    </div>
                    <div className="font-mono text-[11px] text-gray-200 break-all">
                        <div>
                            <span className="text-gray-500">Host:</span>{" "}
                            _dash-verify.{d.domain}
                        </div>
                        <div>
                            <span className="text-gray-500">Type:</span> TXT
                        </div>
                        <div>
                            <span className="text-gray-500">Value:</span>{" "}
                            {d.verificationToken}
                        </div>
                    </div>
                    <div className="mt-2 text-[11px] text-gray-500">
                        After adding the record, click Verify. DNS changes
                        can take a few minutes to propagate.
                    </div>
                </div>
            )}
            {verifyError && (
                <div className="mt-2 text-xs text-red-400">{verifyError}</div>
            )}
            {isVerified && (
                <div className="mt-1 text-[11px] text-gray-500">
                    Verified {new Date(d.verifiedAt!).toLocaleDateString()}
                </div>
            )}
        </div>
    );
}
