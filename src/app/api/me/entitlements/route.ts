/**
 * GET /api/me/entitlements
 *
 * The "what packages do I have access to" view, used by the
 * /account/licenses page. Aggregates every entitlement that applies
 * to the caller:
 *
 *   - Direct user grants (granteeType: user, granteeId: <my-cognitoId>)
 *   - Org grants for any org I'm a member of
 *   - Email-pending invites matching my verified email (not yet claimed)
 *
 * Each entitlement is enriched with package metadata (displayName,
 * description, visibility) and a `via` field indicating how the caller
 * gets access (user / org / email). The client uses `via` to group
 * the list for display.
 *
 * Revoked and expired entitlements are filtered out.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  listEntitlementsForGrantee,
  listOrgsForUser,
  getUserByCognitoId,
  getPackage,
  getOrg,
  type Entitlement,
  type Org,
} from "@/lib/db";

interface EnrichedEntitlement extends Entitlement {
  via: "user" | "org" | "email";
  viaOrg?: { orgId: string; slug: string; name: string };
  package?: {
    scope: string;
    name: string;
    displayName: string;
    description: string;
    visibility: string;
    icon?: string;
  };
}

function isExpired(e: Entitlement): boolean {
  if (!e.expiresAt) return false;
  return new Date(e.expiresAt).getTime() <= Date.now();
}

export async function GET(request: NextRequest) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const userId = token.sub;

    // Direct user entitlements
    const userEntitlements = await listEntitlementsForGrantee("user", userId);

    // Org entitlements — fan-out across every org the user is a member of.
    // We also hydrate each org once so the UI can show "via Acme Corp".
    const memberships = await listOrgsForUser(userId);
    const orgMap: Record<string, Org> = {};
    const orgEntitlementLists = await Promise.all(
      memberships.map(async (m) => {
        const org = await getOrg(m.orgId);
        if (org) orgMap[m.orgId] = org;
        return listEntitlementsForGrantee("org", m.orgId);
      }),
    );
    const orgEntitlements = orgEntitlementLists.flat();

    // Email-pending entitlements — show unclaimed invites that match
    // the caller's verified email. These are technically live too
    // (checkEntitlement honors them), but we tag them "pending" so
    // the UI can show a helpful "ready to claim" state.
    const user = await getUserByCognitoId(userId);
    const email = (user?.email as string | undefined) || token.email || null;
    const emailEntitlements = email
      ? await listEntitlementsForGrantee(
          "email",
          email.trim().toLowerCase(),
        )
      : [];

    // Combine + dedupe, then enrich with package + via metadata.
    const byId = new Map<string, { e: Entitlement; via: "user" | "org" | "email"; viaOrgId?: string }>();
    for (const e of userEntitlements) {
      if (e.revokedAt || isExpired(e)) continue;
      byId.set(e.entitlementId, { e, via: "user" });
    }
    for (const e of orgEntitlements) {
      if (e.revokedAt || isExpired(e)) continue;
      // Don't clobber a direct user grant with an org one — user is stronger
      if (byId.has(e.entitlementId)) continue;
      byId.set(e.entitlementId, { e, via: "org", viaOrgId: e.granteeId });
    }
    for (const e of emailEntitlements) {
      if (e.revokedAt || isExpired(e) || e.claimedByUserId) continue;
      if (byId.has(e.entitlementId)) continue;
      byId.set(e.entitlementId, { e, via: "email" });
    }

    const entries = Array.from(byId.values());

    // Enrich with package metadata. One lookup per unique package.
    const pkgKeys = new Set<string>();
    for (const { e } of entries) pkgKeys.add(`${e.packageScope}#${e.packageName}`);
    const pkgMap: Record<string, EnrichedEntitlement["package"]> = {};
    await Promise.all(
      Array.from(pkgKeys).map(async (key) => {
        const [scope, name] = key.split("#");
        const pkg = await getPackage(scope, name);
        if (pkg) {
          pkgMap[key] = {
            scope: pkg.scope as string,
            name: pkg.name as string,
            displayName: (pkg.displayName as string) || (pkg.name as string),
            description: (pkg.description as string) || "",
            visibility: (pkg.visibility as string) || "public",
            icon: pkg.icon as string | undefined,
          };
        }
      }),
    );

    const enriched: EnrichedEntitlement[] = entries.map(
      ({ e, via, viaOrgId }) => ({
        ...e,
        via,
        viaOrg:
          viaOrgId && orgMap[viaOrgId]
            ? {
                orgId: orgMap[viaOrgId].orgId,
                slug: orgMap[viaOrgId].slug,
                name: orgMap[viaOrgId].name,
              }
            : undefined,
        package: pkgMap[`${e.packageScope}#${e.packageName}`],
      }),
    );

    // Skip entitlements whose package no longer exists (deleted by owner).
    const visible = enriched.filter((e) => e.package);

    return NextResponse.json({ entitlements: visible });
  } catch (err) {
    console.error("[API /me/entitlements] Error:", err);
    return NextResponse.json(
      { error: "Failed to list entitlements" },
      { status: 500 },
    );
  }
}
