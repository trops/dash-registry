/**
 * GET    /api/auth/me/profiles/[id] — one profile kept in the account
 * PUT    /api/auth/me/profiles/[id] — save it: { manifest, baseRevision }
 *        (409 when the account has a newer copy than baseRevision)
 * DELETE /api/auth/me/profiles/[id] — remove it
 *
 * Only the signed-in user's own profiles (lib/accountProfiles).
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  deleteAccountProfile,
  getAccountProfile,
  putAccountProfile,
} from "@/lib/db";
import {
  isProfileId,
  isStoredProfile,
  profileSk,
  profileSummary,
  readProfileBody,
  saveConflict,
  storedProfile,
} from "@/lib/accountProfiles";

export const dynamic = "force-dynamic";

async function signedIn(request: NextRequest) {
  const token = await authenticateRequest(request);
  return token ? token.sub : null;
}

const unauthorized = () =>
  NextResponse.json({ error: "Authentication required" }, { status: 401 });
const badId = () =>
  NextResponse.json({ error: "That isn't a profile id." }, { status: 400 });

async function readStored(userId: string, id: string) {
  const item = await getAccountProfile(userId, profileSk(id));
  return isStoredProfile(item) ? item : null;
}

/** 409: what the account has now, so the app can offer to load it. */
function conflictResponse(
  error: string,
  existing: {
    revision: number;
    updatedOn: string | null;
    updatedAt: string;
  } | null,
) {
  return NextResponse.json(
    {
      error,
      revision: existing ? existing.revision : null,
      updatedOn: existing ? existing.updatedOn : null,
      updatedAt: existing ? existing.updatedAt : null,
    },
    { status: 409 },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await signedIn(request);
  if (!userId) return unauthorized();
  if (!isProfileId(params.id)) return badId();
  try {
    const item = await readStored(userId, params.id);
    if (!item) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...profileSummary(item),
      manifest: JSON.parse(item.body),
    });
  } catch (err) {
    console.error("[API GET /auth/me/profiles/[id]] Error:", err);
    return NextResponse.json(
      { error: "Failed to read the profile" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await signedIn(request);
  if (!userId) return unauthorized();
  if (!isProfileId(params.id)) return badId();
  const body = await request.json().catch(() => null);
  const read = readProfileBody(body);
  if ("error" in read) {
    return NextResponse.json({ error: read.error }, { status: 400 });
  }
  const baseRevision = (body as { baseRevision?: unknown }).baseRevision;
  try {
    const existing = await readStored(userId, params.id);
    const conflict = saveConflict(existing, baseRevision);
    if (conflict) return conflictResponse(conflict, existing);
    const item = storedProfile({
      userId,
      profileId: params.id,
      manifest: read.manifest,
      json: read.json,
      previousRevision: existing ? existing.revision : null,
      now: new Date().toISOString(),
    });
    // Checked again as it's written: another save may have got there first.
    const ok = await putAccountProfile(
      item as unknown as Record<string, unknown>,
      existing ? existing.revision : null,
    );
    if (!ok) {
      return conflictResponse(
        "Your account has a newer copy of this profile, saved from another computer.",
        await readStored(userId, params.id),
      );
    }
    return NextResponse.json(profileSummary(item));
  } catch (err) {
    console.error("[API PUT /auth/me/profiles/[id]] Error:", err);
    return NextResponse.json(
      { error: "Failed to save the profile" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await signedIn(request);
  if (!userId) return unauthorized();
  if (!isProfileId(params.id)) return badId();
  try {
    await deleteAccountProfile(userId, profileSk(params.id));
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[API DELETE /auth/me/profiles/[id]] Error:", err);
    return NextResponse.json(
      { error: "Failed to delete the profile" },
      { status: 500 },
    );
  }
}
