/**
 * GET /api/publishers/keys/revocation-status?fingerprint=<hex>
 *
 * Public endpoint used by installers (dash-electron) immediately
 * before mounting a downloaded widget. The installer passes the
 * fingerprint embedded in the publisher cert it just verified; the
 * registry replies with the revocation state.
 *
 * Response:
 *   200 { fingerprint, revoked: boolean, revokedAt: string | null,
 *         known: boolean }
 *
 *   `known === false` means the fingerprint isn't in the registry at
 *   all — installers should treat that as a hard failure (an unknown
 *   key can't have a valid cert).
 *
 *   `revoked === true` → refuse to mount.
 *   `revoked === false && known === true` → proceed.
 *
 * 400 — missing or malformed fingerprint
 */
import { NextRequest, NextResponse } from "next/server";
import { getPublisherKeyByFingerprint } from "@/lib/publisherKeys";

export const runtime = "nodejs";

const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

export async function GET(request: NextRequest) {
    const fingerprint = request.nextUrl.searchParams.get("fingerprint");
    if (!fingerprint || !FINGERPRINT_RE.test(fingerprint)) {
        return NextResponse.json(
            {
                error: "fingerprint query parameter required (64-char lowercase hex)",
            },
            { status: 400 },
        );
    }

    const row = await getPublisherKeyByFingerprint(fingerprint);
    if (!row) {
        return NextResponse.json({
            fingerprint,
            known: false,
            revoked: false,
            revokedAt: null,
        });
    }

    return NextResponse.json({
        fingerprint,
        known: true,
        revoked: Boolean(row.revokedAt),
        revokedAt: row.revokedAt ?? null,
    });
}
