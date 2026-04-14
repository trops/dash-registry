/**
 * DNS TXT record verification for org domain ownership.
 *
 * To prove ownership of `algolia.com`, the org admin adds a TXT record at
 *   _dash-verify.algolia.com
 * with the value equal to the org's verificationToken (generated at
 * claim-time). We resolve the TXT records and look for an exact match.
 *
 * Uses Node's built-in dns.promises — no external dependency.
 *
 * Security note: anyone can CLAIM any domain (by calling POST
 * /orgs/:orgId/domains). Only the claimant who can write DNS records
 * for that domain can VERIFY it. Entitlement logic only honors
 * verified domains, so unverified claims are inert.
 */
import dns from "node:dns/promises";

/**
 * Generate a verification token. Format: `dash-verify-<random hex>`.
 * Long enough to prevent collision / guessing even if the attacker
 * knows our format. 24 hex chars = 96 bits of entropy.
 */
export function generateVerificationToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `dash-verify-${hex}`;
}

/**
 * Validate basic shape of a domain. Rejects empty strings, schemes
 * (https://), paths (/foo), and emails (@). Not a full RFC parser —
 * the DNS lookup will fail on malformed domains anyway.
 */
export function isPlausibleDomain(input: string): boolean {
  const d = input.trim().toLowerCase();
  if (!d) return false;
  if (d.includes("://") || d.includes("/") || d.includes("@")) return false;
  if (d.includes(" ")) return false;
  if (!d.includes(".")) return false;
  if (d.length > 253) return false;
  return /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(d);
}

/**
 * Look up TXT records at _dash-verify.<domain> and check for the token.
 * Returns { verified: boolean, foundValues: string[] } for UI display.
 *
 * Returns verified=false (not an error) when:
 *   - the record doesn't exist (NXDOMAIN or empty)
 *   - the record exists but doesn't contain the token
 *
 * Throws only on truly unexpected resolver errors.
 */
export async function verifyDomainTxt(
  domain: string,
  expectedToken: string,
): Promise<{ verified: boolean; foundValues: string[] }> {
  const host = `_dash-verify.${domain.trim().toLowerCase()}`;
  let records: string[][] = [];
  try {
    records = await dns.resolveTxt(host);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    // NXDOMAIN / ENOTFOUND / ENODATA all mean "record doesn't exist yet"
    if (
      e.code === "ENOTFOUND" ||
      e.code === "ENODATA" ||
      e.code === "NXDOMAIN"
    ) {
      return { verified: false, foundValues: [] };
    }
    throw err;
  }

  // dns.resolveTxt returns string[][] because TXT records can be split
  // into multiple strings; join each record's parts back together.
  const flattened = records.map((parts) => parts.join(""));
  const verified = flattened.includes(expectedToken);
  return { verified, foundValues: flattened };
}
