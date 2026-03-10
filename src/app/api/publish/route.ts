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
import { putPackage, putPackageVersion, getPackage } from "@/lib/db";
import { uploadPackageZip, buildS3Key } from "@/lib/s3";
import { validateManifest } from "@/lib/validate";

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

        // 7. Upload ZIP to S3
        const zipBuffer = Buffer.from(await file.arrayBuffer());
        const s3Key = await uploadPackageZip(
            scope,
            manifest.name,
            manifest.version,
            zipBuffer,
        );

        // 8. Build download URL
        const registryBaseUrl =
            process.env.REGISTRY_BASE_URL || "https://registry.trops.dev";
        const downloadUrl = `${registryBaseUrl}/api/packages/${scope}/${manifest.name}/download?version=${manifest.version}`;

        // 9. Create/update Package record
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
            visibility: "public",
            ownerId: token.sub,
            downloadUrl,
            widgets: manifest.widgets || [],
            createdAt: existing?.createdAt || now,
        };
        packageRecord.appOrigin = manifest.appOrigin;
        await putPackage(packageRecord);

        // 10. Create PackageVersion record
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
        await putPackageVersion(versionRecord);

        // 11. Return success
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
