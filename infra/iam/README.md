# IAM — Amplify SSR compute role

The Next.js app runs on Amplify Hosting under a **manually-attached custom
compute role**, `DashRegistrySSRComputeRole`. Its ARN appears in CloudWatch as:

```
arn:aws:sts::286802273987:assumed-role/DashRegistrySSRComputeRole/AmplifyHostingCompute-app=d919rwhuzp7rj
```

## Why this isn't in `amplify/backend.ts`

`defineBackend` provisions the DynamoDB tables (via the CDK escape hatch) but
has **no handle on the Amplify Hosting compute role**. So the role's runtime
permissions are not infrastructure-as-code through Amplify — they live as an
inline policy (`DashRegistryAccess`) attached directly to the role.

That gap caused a production incident: when the publisher-signing (Phase 1B)
and signed-download (Phase 5D) features shipped, the role was never granted
access to the new resources they touch. Symptoms:

- `POST /api/publishers/keys/issue-cert` → **500** (`AccessDeniedException` on
  `dynamodb:Query` against `dash-registry-PublisherKeys/index/ByFingerprint`).
- `GET /api/packages/[scope]/[name]/download` → manifest signing failed
  (`AccessDeniedException` on `ssm:GetParameters` for the root signing key).

## Source of truth

[`DashRegistrySSRComputeRole.policy.json`](./DashRegistrySSRComputeRole.policy.json)
is the **full desired inline policy**. It grants:

- DynamoDB data access to every `dash-registry-*` table **and its indexes**
  (including `PublisherKeys` + `ByFingerprint`).
- S3 access to the package bucket.
- `cognito-idp:AdminGetUser`.
- CloudWatch Logs.
- `ssm:GetParameter[s]` on `/dash-registry/*` (the publisher root key).
- `kms:Decrypt` on the `aws/ssm` key, scoped to `kms:ViaService = ssm.*` (to
  decrypt the SecureString root key params).

## Applying

```bash
node scripts/apply-ssr-compute-role-policy.mjs --dry-run   # preview
node scripts/apply-ssr-compute-role-policy.mjs             # apply (PutRolePolicy)
```

`PutRolePolicy` fully replaces the inline policy, so the script is idempotent.
Requires AWS credentials with `iam:PutRolePolicy` on the role.

## When you add a new table, SSM param, or AWS resource

Update `DashRegistrySSRComputeRole.policy.json` **and re-run the apply script**
in the same change as the feature. The role does not pick up new
`dash-registry-*` tables automatically.
