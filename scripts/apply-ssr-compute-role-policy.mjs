#!/usr/bin/env node
/**
 * Apply the inline IAM policy for the Amplify SSR compute role.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Next.js SSR app on Amplify Hosting runs under a manually-attached
 * custom compute role (`DashRegistrySSRComputeRole`), NOT a role managed by
 * `amplify/backend.ts`. defineBackend only provisions the DynamoDB tables;
 * it has no handle on the hosting compute role, so the role's permissions
 * are *not* infrastructure-as-code by default. They drifted: when the
 * publisher-signing (Phase 1B) and signed-download (Phase 5D) features
 * shipped, nobody granted the role access to the `dash-registry-PublisherKeys`
 * table, its `ByFingerprint` GSI, or the `/dash-registry/PUBLISHER_ROOT_*`
 * SSM SecureStrings. Result: `POST /api/publishers/keys/issue-cert` 500'd
 * with AccessDeniedException on `dynamodb:Query`, and `/download` manifest
 * signing failed on `ssm:GetParameters`.
 *
 * This script makes the policy reproducible. The desired full policy lives in
 * `infra/iam/DashRegistrySSRComputeRole.policy.json` (the source of truth);
 * this script pushes it onto the role with PutRolePolicy (which fully
 * replaces the inline policy — idempotent, safe to re-run).
 *
 * USAGE
 *   node scripts/apply-ssr-compute-role-policy.mjs            # apply
 *   node scripts/apply-ssr-compute-role-policy.mjs --dry-run  # print only
 *
 * Requires AWS credentials with iam:PutRolePolicy on the role.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const ROLE_NAME = "DashRegistrySSRComputeRole";
const POLICY_NAME = "DashRegistryAccess";

const __dirname = dirname(fileURLToPath(import.meta.url));
const policyPath = join(
    __dirname,
    "..",
    "infra",
    "iam",
    "DashRegistrySSRComputeRole.policy.json",
);

const policyDocument = readFileSync(policyPath, "utf8");
// Validate it parses before we hand it to AWS.
JSON.parse(policyDocument);

const dryRun = process.argv.includes("--dry-run");

if (dryRun) {
    console.log(`[dry-run] Would apply ${policyPath} to`);
    console.log(`[dry-run]   role:   ${ROLE_NAME}`);
    console.log(`[dry-run]   policy: ${POLICY_NAME}`);
    console.log(policyDocument);
    process.exit(0);
}

console.log(`Applying ${POLICY_NAME} to ${ROLE_NAME}...`);
execFileSync(
    "aws",
    [
        "iam",
        "put-role-policy",
        "--role-name",
        ROLE_NAME,
        "--policy-name",
        POLICY_NAME,
        "--policy-document",
        policyDocument,
    ],
    { stdio: "inherit" },
);
console.log("Done. Inline policy updated.");
