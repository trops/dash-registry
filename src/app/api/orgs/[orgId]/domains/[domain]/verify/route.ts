/**
 * POST /api/orgs/[orgId]/domains/[domain]/verify
 *
 * Re-run the DNS TXT check for a pending domain claim. On first
 * success we flip verifiedAt and the domain starts granting implicit
 * org access to any user whose email is @<domain>.
 *
 * Admin only. Idempotent — subsequent calls on an already-verified
 * record just re-return the record without rechecking DNS.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { isAdmin } from "@/lib/orgs";
import {
  getOrgDomain,
  markOrgDomainVerified,
  listOrgsForDomain,
} from "@/lib/db";
import { verifyDomainTxt } from "@/lib/dnsVerify";

export async function POST(
  request: NextRequest,
  { params }: { params: { orgId: string; domain: string } },
) {
  const token = await authenticateRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { orgId } = params;
  const domain = decodeURIComponent(params.domain).trim().toLowerCase();

  if (!(await isAdmin(orgId, token.sub))) {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 },
    );
  }

  try {
    const record = await getOrgDomain(orgId, domain);
    if (!record) {
      return NextResponse.json(
        { error: "Domain claim not found" },
        { status: 404 },
      );
    }
    if (record.verifiedAt) {
      return NextResponse.json({ domain: record, alreadyVerified: true });
    }

    // Another org could win the race to verify the same domain. Guard
    // one more time before running DNS.
    const claimants = await listOrgsForDomain(domain);
    const othersVerified = claimants.some(
      (c) => c.verifiedAt && c.orgId !== orgId,
    );
    if (othersVerified) {
      return NextResponse.json(
        { error: "Domain is already verified by another organization" },
        { status: 409 },
      );
    }

    const result = await verifyDomainTxt(domain, record.verificationToken);
    if (!result.verified) {
      return NextResponse.json(
        {
          error: "DNS verification failed",
          expected: record.verificationToken,
          foundValues: result.foundValues,
          hint: `Add a TXT record at _dash-verify.${domain} with value ${record.verificationToken}. DNS changes can take a few minutes to propagate.`,
        },
        { status: 400 },
      );
    }

    const updated = await markOrgDomainVerified(orgId, domain);
    return NextResponse.json({ domain: updated });
  } catch (err) {
    console.error("[API /orgs/domains/verify POST] Error:", err);
    return NextResponse.json(
      { error: "Failed to verify domain" },
      { status: 500 },
    );
  }
}
