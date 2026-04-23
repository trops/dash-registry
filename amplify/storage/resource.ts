/**
 * Amplify Storage — S3 Bucket Configuration
 *
 * Stores widget/dashboard ZIP packages.
 * Path: packages/{scope}/{name}/{version}/{name}-v{version}.zip
 *
 * Access rules:
 * - Authenticated users: read, write, delete on `packages/*`
 * - Public: read (download) all packages
 *
 * `delete` is required so the DELETE /api/packages/[scope]/[name]
 * endpoint can clean up versioned ZIPs alongside the DB records.
 * Amplify Gen2 grants these actions to BOTH the Cognito authenticated
 * role AND the SSR hosting compute role, which is what actually calls
 * S3 from the Next.js API route via the raw @aws-sdk/client-s3 client.
 * Without `delete`, the SSR compute role's policy omits
 * `s3:DeleteObject` and the delete API fails with AccessDenied.
 */
import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
    name: "dash-registry-packages",
    access: (allow) => ({
        "packages/*": [
            allow.guest.to(["read"]),
            allow.authenticated.to(["read", "write", "delete"]),
        ],
    }),
});
