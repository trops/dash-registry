/**
 * POST /api/orgs/[orgId]/domains — claim a domain for this org (admin only)
 * GET  /api/orgs/[orgId]/domains — list domains (member only)
 *
 * Claiming creates a pending record with a fresh verificationToken. The
 * owner must then add a TXT record at _dash-verify.<domain> and hit
 * POST .../verify to flip the verifiedAt timestamp.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { isAdmin, isMember } from "@/lib/orgs";
import {
  getOrg,
  getOrgDomain,
  listOrgDomains,
  listOrgsForDomain,
  putOrgDomain,
} from "@/lib/db";
import { generateVerificationToken, isPlausibleDomain } from "@/lib/dnsVerify";

export async function POST(
  request: NextRequest,
  { params }: { params: { orgId: string } },
) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { orgId } = params;
  if (!(await isAdmin(orgId, token.sub))) {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const rawDomain = String(body?.domain || "");
    const domain = rawDomain.trim().toLowerCase();

    if (!isPlausibleDomain(domain)) {
      return NextResponse.json(
        {
          error:
            "Invalid domain. Use the bare domain, e.g. 'algolia.com' — no https://, no paths.",
        },
        { status: 400 },
      );
    }

    // Block a re-claim if this domain is already VERIFIED elsewhere.
    // Multiple pending claims are allowed — only one can ever pass
    // verification since they'd need different TXT values.
    const existing = await listOrgsForDomain(domain);
    const verifiedClaim = existing.find(
      (d) => d.verifiedAt && d.orgId !== orgId,
    );
    if (verifiedClaim) {
      return NextResponse.json(
        {
          error:
            "Domain is already verified by another organization. Contact support if this is wrong.",
        },
        { status: 409 },
      );
    }

    const prior = await getOrgDomain(orgId, domain);
    if (prior) {
      // Idempotent — return existing record with its token so UI can
      // re-display the TXT instructions.
      return NextResponse.json({ domain: prior });
    }

    const record = {
      orgId,
      domain,
      verificationToken: generateVerificationToken(),
      verifiedAt: null,
      createdByUserId: token.sub,
      createdAt: new Date().toISOString(),
    };
    await putOrgDomain(record);
    return NextResponse.json({ domain: record }, { status: 201 });
  } catch (err) {
    console.error("[API /orgs/domains POST] Error:", err);
    return NextResponse.json(
      { error: "Failed to claim domain" },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { orgId: string } },
) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { orgId } = params;
  if (!(await isMember(orgId, token.sub))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  try {
    // getOrg is a fast existence check — keeps 404 before listing
    const org = await getOrg(orgId);
    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }
    const domains = await listOrgDomains(orgId);
    return NextResponse.json({ domains });
  } catch (err) {
    console.error("[API /orgs/domains GET] Error:", err);
    return NextResponse.json(
      { error: "Failed to list domains" },
      { status: 500 },
    );
  }
}
