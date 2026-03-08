# Amplify Backend — Architecture & Operations Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        dash-registry (Next.js 14)                   │
│                                                                     │
│  src/app/api/                                                       │
│  ├── packages/         GET /api/packages                            │
│  ├── publish/          POST /api/publish                            │
│  └── auth/                                                          │
│      ├── device/       POST (initiate) / GET (poll)                 │
│      ├── device/authorize/  POST (authorize code)                   │
│      ├── register/     POST /api/auth/register                      │
│      └── me/           GET /api/auth/me                             │
│                                                                     │
│  src/lib/                                                           │
│  ├── db.ts             DynamoDB client + table operations            │
│  └── deviceFlow.ts     Device code flow (DynamoDB-backed)           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                    AWS SDK (raw calls)
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────┐  ┌─────────────────┐  ┌───────────┐
│   Cognito   │  │    DynamoDB     │  │    S3     │
│  User Pool  │  │   (5 tables)    │  │  Bucket   │
│             │  │                 │  │           │
│ Email login │  │ Users           │  │ packages/ │
│ (no OAuth   │  │ Packages        │  │  {scope}/ │
│  yet)       │  │ PackageVersions │  │   {name}/ │
│             │  │ UserLibrary     │  │    .zip   │
│             │  │ DeviceCodes     │  │           │
└─────────────┘  └─────────────────┘  └───────────┘
         ▲                 ▲                 ▲
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
              Amplify Gen 2 (CDK)
              amplify/backend.ts
```

## Key Architecture Decision

**Why CDK escape hatch instead of Amplify Data?**

Amplify Data (`a.model()`) creates DynamoDB tables via AppSync with composite sort keys that concatenate fields (e.g., `packageName#version` as a single opaque SK). But `src/lib/db.ts` uses raw AWS SDK DynamoDB calls that treat each key attribute separately. These are **incompatible**.

**Solution:** We use Amplify for Auth + Storage only, and create DynamoDB tables directly via CDK in `amplify/backend.ts`. This gives us full control over table key schemas and keeps `db.ts` working as-is.

---

## AWS Resources

### Cognito User Pool

| Property | Value |
|----------|-------|
| Pool ID | `us-east-1_oIS59FIu7` |
| Region | `us-east-1` |
| Login method | Email + password |
| OAuth | None (Google OAuth deferred until SSM secrets configured) |

### S3 Bucket

| Property | Value |
|----------|-------|
| Bucket | `amplify-dashregistry-john-dashregistrypackagesbuck-gs03tawpkejz` |
| Path pattern | `packages/{scope}/{name}/{version}/{name}-v{version}.zip` |
| Guest access | read |
| Authenticated access | read, write |

### DynamoDB Tables

| Table | Partition Key | Sort Key | Special |
|-------|--------------|----------|---------|
| `dash-registry-Users` | `cognitoId` | — | |
| `dash-registry-Packages` | `scope` | `name` | |
| `dash-registry-PackageVersions` | `packageScope` | `sk` (`{name}#{version}`) | Composite SK |
| `dash-registry-UserLibrary` | `userId` | `sk` (`{scope}#{name}`) | Composite SK |
| `dash-registry-DeviceCodes` | `deviceCode` | — | TTL on `ttl`, GSI on `userCode` |

**Composite sort keys:** PackageVersions and UserLibrary use a `sk` field that combines two values with `#` as delimiter. This allows querying by prefix (e.g., `begins_with(sk, "clock-dashboard#")` to get all versions of a package).

**DeviceCodes TTL:** The `ttl` field (Unix epoch seconds) tells DynamoDB to auto-delete expired device codes. No cleanup cron needed.

**DeviceCodes GSI:** The `userCode-index` GSI allows looking up a device code entry by the human-readable user code (used during authorization).

---

## File Map

```
amplify/
├── backend.ts           # Root backend: auth + storage + CDK DynamoDB tables
├── auth/
│   └── resource.ts      # Cognito config (email login, user attributes)
├── storage/
│   └── resource.ts      # S3 bucket config (package ZIPs)
└── tsconfig.json        # Amplify-specific TS config (es2022, bundler)

src/lib/
├── db.ts                # DynamoDB client, TABLES config, CRUD operations
└── deviceFlow.ts        # Device code flow: create, get, delete, authorize

amplify_outputs.json     # Generated by `ampx sandbox` — DO NOT commit
.env.local               # Env vars pointing to deployed resources — DO NOT commit
```

---

## Environment Variables

Set in `.env.local` (extracted from `amplify_outputs.json`):

```
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=<from auth output>
COGNITO_REGION=us-east-1
PACKAGES_BUCKET=<from storage output>
USERS_TABLE=dash-registry-Users
PACKAGES_TABLE=dash-registry-Packages
PACKAGE_VERSIONS_TABLE=dash-registry-PackageVersions
USER_LIBRARY_TABLE=dash-registry-UserLibrary
DEVICE_CODES_TABLE=dash-registry-DeviceCodes
REGISTRY_BASE_URL=http://localhost:3000
```

---

## Common Operations

### Start the sandbox (development)

```bash
# Must use Node 20 (not Node 24)
source ~/.nvm/nvm.sh
nvm use --delete-prefix v20.20.0

cd ~/Development/dash-registry
npx ampx sandbox
```

This watches `amplify/` for changes and hot-deploys. Leave it running in a dedicated terminal.

### Stop the sandbox

Press `Ctrl+C` in the sandbox terminal. Resources stay deployed.

### Delete the sandbox (tear down all resources)

```bash
npx ampx sandbox delete
```

This removes all CloudFormation stacks, DynamoDB tables, Cognito pool, and S3 bucket.

### Deploy a one-off change

```bash
npx ampx sandbox --once
```

Deploys and exits (no watch mode).

### Seed the database

```bash
node scripts/migrate-to-dynamo.js          # writes to DynamoDB
node scripts/migrate-to-dynamo.js --dry-run # preview only
```

Reads package manifests from `packages/` directory and writes them to the Packages and PackageVersions tables.

---

## Modifying the Backend

### Add a new DynamoDB table

1. Edit `amplify/backend.ts` — add a new `dynamodb.Table` construct
2. Add the table name to `backend.addOutput({ custom: { ... } })`
3. Add the env var to `.env.local`
4. Add the table to `TABLES` in `src/lib/db.ts`
5. The sandbox auto-deploys the change

Example:
```typescript
const myTable = new dynamodb.Table(dataStack, "MyTable", {
    tableName: "dash-registry-MyTable",
    partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.DESTROY,
});
```

### Add a GSI to an existing table

```typescript
myTable.addGlobalSecondaryIndex({
    indexName: "myField-index",
    partitionKey: { name: "myField", type: dynamodb.AttributeType.STRING },
});
```

### Enable TTL on a table

```typescript
const myTable = new dynamodb.Table(dataStack, "MyTable", {
    // ...
    timeToLiveAttribute: "ttl",  // field name containing Unix epoch (seconds)
});
```

### Change auth config

Edit `amplify/auth/resource.ts`. To re-enable Google OAuth later:

1. Set SSM secrets: `npx ampx sandbox secret set GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
2. Add the `externalProviders` block back to `defineAuth()`

### Change storage config

Edit `amplify/storage/resource.ts` to modify S3 access rules or path patterns.

---

## Troubleshooting

### `Cannot find module 'amplify/auth/resource'`

- Must use Node 20, not Node 24. Node 24 breaks the `tsx` ESM loader.
- Clear stale cache: `rm -rf .amplify` and retry.

### `SSMCredentialsError: AccessDeniedException`

- IAM user needs `AdministratorAccess` policy for sandbox operations.
- CDK must be bootstrapped: `npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1`

### `Table not found` errors at runtime

- Check `.env.local` has correct table names matching `amplify_outputs.json`.
- Verify the sandbox is running (`npx ampx sandbox`).

### Device codes not expiring

- DynamoDB TTL runs async — items may persist up to ~48 hours after TTL. In practice, most are deleted within 15 minutes.
- The API also checks `expiresAt` client-side before returning results.

---

## Production Deployment (Future)

The current setup is a **sandbox** (personal dev environment). For production:

1. **Amplify Hosting** — `npx ampx pipeline-deploy` or connect via AWS Console
2. **Custom domain** — Configure in Amplify Console or Route 53
3. **Google OAuth** — Set SSM secrets and re-enable in `auth/resource.ts`
4. **Scoped IAM** — Replace `AdministratorAccess` with fine-grained policies
5. **Table backups** — Enable point-in-time recovery on DynamoDB tables
6. **RemovalPolicy** — Change from `DESTROY` to `RETAIN` for production tables
