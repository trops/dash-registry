/**
 * S3 client helpers for package ZIP storage.
 *
 * Handles uploads and pre-signed download URL generation.
 */
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
});

const BUCKET =
    process.env.PACKAGES_BUCKET || "dash-registry-packages";

/**
 * Build the S3 key for a package ZIP.
 */
export function buildS3Key(
    scope: string,
    name: string,
    version: string,
): string {
    return `packages/${scope}/${name}/${version}/${name}-v${version}.zip`;
}

/**
 * Upload a ZIP buffer to S3.
 */
export async function uploadPackageZip(
    scope: string,
    name: string,
    version: string,
    zipBuffer: Buffer,
): Promise<string> {
    const key = buildS3Key(scope, name, version);

    await s3.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: zipBuffer,
            ContentType: "application/zip",
        }),
    );

    return key;
}

/**
 * Generate a pre-signed download URL for a package ZIP.
 * Default expiry: 1 hour.
 */
export async function getDownloadUrl(
    scope: string,
    name: string,
    version: string,
    expiresIn = 3600,
): Promise<string> {
    const key = buildS3Key(scope, name, version);

    const url = await getSignedUrl(
        s3,
        new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        }),
        { expiresIn },
    );

    return url;
}
