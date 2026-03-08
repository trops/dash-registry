/**
 * Amplify Storage — S3 Bucket Configuration
 *
 * Stores widget/dashboard ZIP packages.
 * Path: packages/{scope}/{name}/{version}/{name}-v{version}.zip
 *
 * Access rules:
 * - Authenticated users: upload to their own scope path only
 * - Public: read (download) all packages
 */
import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
    name: "dash-registry-packages",
    access: (allow) => ({
        "packages/*": [
            allow.guest.to(["read"]),
            allow.authenticated.to(["read", "write"]),
        ],
    }),
});
