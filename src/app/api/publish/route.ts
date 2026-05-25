/**
 * POST /api/publish
 *
 * Publish a widget/dashboard package to the registry.
 * Requires authentication. Accepts multipart form data with:
 * - file: ZIP archive
 * - manifest: JSON string of the package manifest
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getUserByCognitoId } from "@/lib/db";
import {
    putPackage,
    putPackageVersion,
    getPackage,
    listEntitlementsForPackage,
    putEntitlement,
} from "@/lib/db";
import { uploadPackageZip, buildS3Key } from "@/lib/s3";
import { validateManifest } from "@/lib/validate";
import { buildEntitlement } from "@/lib/entitlement";
import {
    verifyPublisherCert,
    verifyZipSignature,
    type PublisherCert,
} from "@/lib/crypto";
import { getPublisherKey } from "@/lib/publisherKeys";
import { getRegistryRootPublicKey } from "@/lib/registryRootKey";

// Crypto + DynamoDB + SSM all require the Node runtime.
export const runtime = "nodejs";

// When true, publishes without a valid signature + cert are rejected.
// Phase 1A ships with this OFF so the dash-electron publisher side can
// migrate over without an outage; flip to "true" once the consumer-side
// signing is rolled out (Phase 1B). Behavior when present-but-invalid is
// ALWAYS strict — bad signatures are rejected regardless of this flag.
const REQUIRE_SIGNED_PUBLISH =
    process.env.DASH_REGISTRY_REQUIRE_SIGNED_PUBLISH === "true";

export async function POST(request: NextRequest) {
    // 1. Authenticate
    const token = await authenticateRequest(request);
    if (!token) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    // 2. Get user profile
    const user = await getUserByCognitoId(token.sub);
    if (!user) {
        return NextResponse.json(
            {
                error: "User profile not found. Please complete registration at the registry website first.",
            },
            { status: 403 },
        );
    }

    try {
        // 3. Parse multipart form data
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const manifestJson = formData.get("manifest") as string | null;
        // Phase 1A signing fields (all optional during the rollout
        // window; see REQUIRE_SIGNED_PUBLISH).
        const zipSignatureRaw = formData.get("signature");
        const publisherCertRaw = formData.get("publisherCert");
        const publisherKeyIdRaw = formData.get("publisherKeyId");
        const zipSignature =
            typeof zipSignatureRaw === "string" ? zipSignatureRaw : null;
        const publisherCertJson =
            typeof publisherCertRaw === "string" ? publisherCertRaw : null;
        const publisherKeyId =
            typeof publisherKeyIdRaw === "string" ? publisherKeyIdRaw : null;

        if (!file) {
            return NextResponse.json(
                { error: "ZIP file is required" },
                { status: 400 },
            );
        }

        if (!manifestJson) {
            return NextResponse.json(
                { error: "Manifest JSON is required" },
                { status: 400 },
            );
        }

        // 4. Parse and validate manifest
        let manifest;
        try {
            manifest = JSON.parse(manifestJson);
        } catch {
            return NextResponse.json(
                { error: "Invalid manifest JSON" },
                { status: 400 },
            );
        }

        const validation = validateManifest(manifest);
        if (!validation.valid) {
            return NextResponse.json(
                {
                    error: "Manifest validation failed",
                    details: validation.errors,
                },
                { status: 400 },
            );
        }

        // 5. Verify scope matches user's username
        const scope = manifest.scope || manifest.githubUser;
        if (scope !== user.username) {
            return NextResponse.json(
                {
                    error: `Scope "${scope}" does not match your username "${user.username}". You can only publish under your own scope.`,
                },
                { status: 403 },
            );
        }

        // 6. Check if package exists and user owns it
        const existing = await getPackage(scope, manifest.name);
        if (existing && existing.ownerId !== token.sub) {
            return NextResponse.json(
                {
                    error: `Package "${scope}/${manifest.name}" is owned by another user.`,
                },
                { status: 403 },
            );
        }

        // 7. Verify signature + publisher cert (Phase 1A).
        //    If REQUIRE_SIGNED_PUBLISH is false, signatures are optional
        //    but verified when present. If true, they're required.
        const zipBuffer = Buffer.from(await file.arrayBuffer());
        const haveSigningFields = Boolean(
            zipSignature && publisherCertJson && publisherKeyId,
        );
        let verifiedFingerprint: string | null = null;
        let verifiedCert: PublisherCert | null = null;

        if (REQUIRE_SIGNED_PUBLISH && !haveSigningFields) {
            return NextResponse.json(
                {
                    error:
                        "This registry requires signed publishes. " +
                        "Provide `signature`, `publisherCert`, and `publisherKeyId` form fields.",
                },
                { status: 400 },
            );
        }

        if (haveSigningFields) {
            let parsedCert: PublisherCert;
            try {
                parsedCert = JSON.parse(publisherCertJson as string);
            } catch {
                return NextResponse.json(
                    { error: "publisherCert must be valid JSON" },
                    { status: 400 },
                );
            }

            // (a) cert chains to the registry root key
            const rootPublicKey = await getRegistryRootPublicKey();
            try {
                await verifyPublisherCert({
                    cert: parsedCert,
                    registryRootPublicKey: rootPublicKey,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Invalid cert";
                return NextResponse.json(
                    { error: `Publisher cert rejected: ${msg}` },
                    { status: 400 },
                );
            }

            // (b) cert's publisher_id matches the authenticated user
            if (parsedCert.body.publisher_id !== token.sub) {
                return NextResponse.json(
                    {
                        error:
                            "Publisher cert's publisher_id does not match the authenticated user.",
                    },
                    { status: 403 },
                );
            }

            // (c) the key referenced exists in the publisher_keys table
            //     and is not revoked
            const keyRow = await getPublisherKey(
                token.sub,
                publisherKeyId as string,
            );
            if (!keyRow) {
                return NextResponse.json(
                    {
                        error: "publisherKeyId is not a registered key for your account.",
                    },
                    { status: 400 },
                );
            }
            if (keyRow.revokedAt) {
                return NextResponse.json(
                    {
                        error: `Signing key has been revoked at ${keyRow.revokedAt}.`,
                    },
                    { status: 400 },
                );
            }
            if (keyRow.publicKey !== parsedCert.body.public_key) {
                return NextResponse.json(
                    {
                        error: "Publisher cert's public key does not match the registered key.",
                    },
                    { status: 400 },
                );
            }

            // (d) ZIP signature verifies against the publisher's
            //     public key from the cert
            const sigOk = await verifyZipSignature({
                zipBytes: new Uint8Array(zipBuffer),
                signature: zipSignature as string,
                publisherPublicKey: parsedCert.body.public_key,
            });
            if (!sigOk) {
                return NextResponse.json(
                    {
                        error: "ZIP signature does not verify against the publisher's key.",
                    },
                    { status: 400 },
                );
            }

            verifiedFingerprint = parsedCert.body.fingerprint;
            verifiedCert = parsedCert;
        }

        // 7b. Upload ZIP to S3
        const s3Key = await uploadPackageZip(
            scope,
            manifest.name,
            manifest.version,
            zipBuffer,
        );

        // 8. Build download URL
        const registryBaseUrl =
            process.env.REGISTRY_BASE_URL ||
            `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("host")}`;
        const downloadUrl = `${registryBaseUrl}/api/packages/${scope}/${manifest.name}/download?version=${manifest.version}`;

        // 9. Determine visibility (respect manifest; default public)
        //    On update, the existing visibility wins unless the manifest
        //    explicitly specifies — prevents accidental flips.
        const manifestVisibility = manifest.visibility;
        const visibility =
            manifestVisibility === "private" || manifestVisibility === "public"
                ? manifestVisibility
                : (existing?.visibility as string | undefined) || "public";

        // 10. Create/update Package record
        const now = new Date().toISOString();
        const packageRecord: Record<string, unknown> = {
            scope,
            name: manifest.name,
            displayName: manifest.displayName,
            author: manifest.author || user.displayName,
            description: manifest.description || "",
            type: manifest.type || "widget",
            category: manifest.category || "general",
            tags: manifest.tags || [],
            icon: manifest.icon || "",
            latestVersion: manifest.version,
            repository: manifest.repository || "",
            visibility,
            ownerId: token.sub,
            downloadUrl,
            widgets: manifest.widgets || [],
            createdAt: existing?.createdAt || now,
        };
        packageRecord.appOrigin = manifest.appOrigin;
        if (manifest.providerTypes && Array.isArray(manifest.providerTypes)) {
            packageRecord.providerTypes = manifest.providerTypes;
        }
        if (manifest.theme) {
            packageRecord.theme = manifest.theme;
        }
        if (manifest.colors) {
            packageRecord.colors = manifest.colors;
        }
        await putPackage(packageRecord);

        // 11. Create PackageVersion record
        const versionRecord: Record<string, unknown> = {
            packageScope: scope,
            packageName: manifest.name,
            version: manifest.version,
            downloadUrl,
            manifest: manifest,
            widgets: manifest.widgets || [],
            providers: manifest.providers || [],
            eventWiring: manifest.eventWiring || [],
            fileSize: zipBuffer.length,
            ownerId: token.sub,
        };
        versionRecord.appOrigin = manifest.appOrigin;
        if (manifest.theme) {
            versionRecord.theme = manifest.theme;
        }
        // Phase 1A signing metadata — present only when the publisher
        // supplied (and the registry verified) a signature.
        if (haveSigningFields && verifiedCert) {
            versionRecord.zipSignature = zipSignature;
            versionRecord.publisherCert = verifiedCert;
            versionRecord.publisherKeyId = publisherKeyId;
            versionRecord.publisherFingerprint = verifiedFingerprint;
        }
        await putPackageVersion(versionRecord);

        // 12. Self-grant entitlement for the owner — surfaces them in the
        //     access management UI and means owners are entitled the same
        //     way as any other grantee (the entitlement check still has a
        //     dedicated isOwner short-circuit, this is for transparency).
        //     Idempotent: skip if any owner-source entitlement already
        //     exists for this user/package pair.
        try {
            const existingEntitlements = await listEntitlementsForPackage(
                scope,
                manifest.name,
            );
            const ownerKey = `user#${token.sub}`;
            const alreadyEntitled = existingEntitlements.some(
                (e) =>
                    !e.revokedAt &&
                    e.granteeKey === ownerKey &&
                    e.source === "owner",
            );
            if (!alreadyEntitled) {
                await putEntitlement(
                    buildEntitlement({
                        packageScope: scope,
                        packageName: manifest.name,
                        versionConstraint: "*",
                        granteeType: "user",
                        granteeId: token.sub,
                        seats: null,
                        source: "owner",
                        createdByUserId: token.sub,
                    }),
                );
            }
        } catch (err) {
            // Don't fail the publish if the self-grant write fails — the
            // isOwner check in checkEntitlement still gives the owner
            // access. Log for diagnosis.
            console.warn(
                "[API /publish] Could not write owner self-grant entitlement:",
                err,
            );
        }

        // 13. Return success
        const registryUrl = `${registryBaseUrl}/package/${scope}/${manifest.name}`;

        return NextResponse.json({
            success: true,
            registryUrl,
            packageId: `${scope}/${manifest.name}`,
            version: manifest.version,
            downloadUrl,
            warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
        });
    } catch (err) {
        console.error("[API /publish] Error:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
