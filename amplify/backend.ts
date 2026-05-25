/**
 * Amplify Backend — Root Definition
 *
 * Combines auth + storage from Amplify, then creates DynamoDB tables
 * via CDK escape hatch. We bypass Amplify Data (AppSync) because its
 * composite sort keys are incompatible with the raw SDK calls in db.ts.
 */
import { defineBackend } from "@aws-amplify/backend";
// Node 22.6+ native TypeScript loader (used by ampx during CDK
// assembly on this machine — Node v24) strips types from .ts files
// but does NOT probe file extensions on relative imports. It needs
// the exact `.ts` extension. The `bundler` moduleResolution setting
// in tsconfig allows this syntax and ts would also happily resolve
// without it, but the Node runtime loader is strict.
import { auth } from "./auth/resource.ts";
import { storage } from "./storage/resource.ts";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import {
    CfnUserPoolDomain,
    CfnUserPoolIdentityProvider,
} from "aws-cdk-lib/aws-cognito";
import { RemovalPolicy } from "aws-cdk-lib";
import { execSync } from "node:child_process";

/**
 * Resolve an SSM SecureString parameter synchronously at CDK synth time.
 * Cognito IDP ProviderDetails rejects `{{resolve:ssm-secure:...}}` for
 * client_id / client_secret, so concrete values must be baked into the
 * synthesized template. SSM stays the source of truth; the generated
 * template lives in `.amplify/artifacts/cdk.out/` (gitignored).
 */
function readSsmSecureString(name: string): string {
    return execSync(
        `aws ssm get-parameter --with-decryption --name ${JSON.stringify(name)} --query Parameter.Value --output text`,
        { encoding: "utf8" },
    ).trim();
}

const backend = defineBackend({
    auth,
    storage,
});

// Google identity provider — raw OIDC IDP rather than Amplify's native
// `google` factory. Native-Google type silently strips
// `authorize_request_extra_params`, so `prompt=select_account` never
// reaches Google and the account picker never renders. OIDC type honors
// it. ProviderName is "GoogleOIDC" (not "Google") because Cognito
// reserves the literal name "Google" for its native-Google IDP type
// and rejects `CreateIdentityProvider` with "Provider Google cannot be
// of type OIDC". Existing federated users are pre-linked to this new
// provider name via `scripts/link-google-oidc.mjs` so their pool-user
// sub (and therefore every dash-registry record keyed on cognitoId)
// stays intact.
const googleIdp = new CfnUserPoolIdentityProvider(
    backend.auth.stack,
    "GoogleOidcIdp",
    {
        userPoolId: backend.auth.resources.userPool.userPoolId,
        providerName: "GoogleOIDC",
        providerType: "OIDC",
        providerDetails: {
            client_id: readSsmSecureString(
                "/amplify/dashregistry/johngiatropoulos-sandbox-e718e335ed/GOOGLE_CLIENT_ID",
            ),
            client_secret: readSsmSecureString(
                "/amplify/dashregistry/johngiatropoulos-sandbox-e718e335ed/GOOGLE_CLIENT_SECRET",
            ),
            oidc_issuer: "https://accounts.google.com",
            authorize_scopes: "openid email profile",
            attributes_request_method: "GET",
            // authorize_url points at our own Next.js API route, which
            // 302s to Google after appending `prompt=select_account`.
            // Cognito rejects two simpler alternatives for OIDC IDPs:
            //   - `authorize_request_extra_params` (SAML-only)
            //   - `authorize_url` with a query string ("OIDC endpoint
            //     can not contain queries")
            // So we proxy the authorize hop through our app.
            //
            // CRITICAL: Cognito only honors an explicit `authorize_url`
            // when **all four** endpoint URLs are also explicit — set
            // just `authorize_url` alone and Cognito silently discards
            // it in favor of whatever it pulls from
            // `<oidc_issuer>/.well-known/openid-configuration` at
            // runtime. So we hardcode token_url / attributes_url /
            // jwks_uri to Google's published endpoints too, which
            // disables the auto-discovery path entirely.
            authorize_url:
                "https://main.d919rwhuzp7rj.amplifyapp.com/api/oauth/google",
            token_url: "https://oauth2.googleapis.com/token",
            attributes_url:
                "https://openidconnect.googleapis.com/v1/userinfo",
            jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
        },
        attributeMapping: {
            email: "email",
            name: "name",
            picture: "picture",
            username: "sub",
        },
    },
);

// Register the new OIDC provider on the User Pool Client so the hosted
// UI accepts `identity_provider=GoogleOIDC` on /oauth2/authorize.
const userPoolClient = backend.auth.resources.cfnResources.cfnUserPoolClient;
userPoolClient.supportedIdentityProviders = ["COGNITO", "GoogleOIDC"];
userPoolClient.addDependency(googleIdp);

// Callback/logout URLs — these would normally be generated by Amplify's
// `externalProviders` block on defineAuth, but we no longer declare one
// there (its only provider was Google, which is now CDK-managed as
// OIDC). Without them, the User Pool Client would fall back to
// Amplify's placeholder `https://example.com` and break sign-in from
// every real origin.
userPoolClient.callbackUrLs = [
    "https://main.d919rwhuzp7rj.amplifyapp.com/",
    "http://localhost:3000/",
    "http://localhost:3001/",
];
userPoolClient.logoutUrLs = [
    "https://main.d919rwhuzp7rj.amplifyapp.com/",
    "http://localhost:3000/",
    "http://localhost:3001/",
];

// Cognito hosted-UI domain — also normally created by Amplify's
// `externalProviders` block. The prefix matches the value baked into
// the committed `amplify_outputs.json` so the deployed frontend
// continues to resolve the same `<prefix>.auth.us-east-1.amazoncognito.com`
// hostname for /oauth2/authorize, /oauth2/token, /logout.
new CfnUserPoolDomain(backend.auth.stack, "UserPoolHostedUiDomain", {
    userPoolId: backend.auth.resources.userPool.userPoolId,
    domain: "d6069e4afd3a4d6d6558",
});

// --- DynamoDB Tables (CDK escape hatch) ---

const dataStack = backend.createStack("DashRegistryData");

// Users table — PK: cognitoId
const usersTable = new dynamodb.Table(dataStack, "UsersTable", {
    tableName: "dash-registry-Users",
    partitionKey: { name: "cognitoId", type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.DESTROY,
});

// Packages table — PK: scope, SK: name
const packagesTable = new dynamodb.Table(dataStack, "PackagesTable", {
    tableName: "dash-registry-Packages",
    partitionKey: { name: "scope", type: dynamodb.AttributeType.STRING },
    sortKey: { name: "name", type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.DESTROY,
});

// PackageVersions table — PK: packageScope, SK: sk (e.g. "clock-dashboard#1.0.0")
const packageVersionsTable = new dynamodb.Table(
    dataStack,
    "PackageVersionsTable",
    {
        tableName: "dash-registry-PackageVersions",
        partitionKey: {
            name: "packageScope",
            type: dynamodb.AttributeType.STRING,
        },
        sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.DESTROY,
    },
);

// UserLibrary table — PK: userId, SK: sk (e.g. "trops#clock-dashboard")
const userLibraryTable = new dynamodb.Table(dataStack, "UserLibraryTable", {
    tableName: "dash-registry-UserLibrary",
    partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
    sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.DESTROY,
});

// DeviceCodes table — PK: deviceCode, TTL on `ttl` field, GSI on userCode
const deviceCodesTable = new dynamodb.Table(dataStack, "DeviceCodesTable", {
    tableName: "dash-registry-DeviceCodes",
    partitionKey: { name: "deviceCode", type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    timeToLiveAttribute: "ttl",
    removalPolicy: RemovalPolicy.DESTROY,
});

deviceCodesTable.addGlobalSecondaryIndex({
    indexName: "userCode-index",
    partitionKey: { name: "userCode", type: dynamodb.AttributeType.STRING },
});

// Orgs table — PK: orgId
// GSI "slug-index": lookup by unique slug
const orgsTable = new dynamodb.Table(dataStack, "OrgsTable", {
    tableName: "dash-registry-Orgs",
    partitionKey: { name: "orgId", type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.DESTROY,
});

orgsTable.addGlobalSecondaryIndex({
    indexName: "slug-index",
    partitionKey: { name: "slug", type: dynamodb.AttributeType.STRING },
});

// OrgMemberships table — PK: orgId, SK: userId
// GSI "ByUser": lookup an individual user's org memberships
const orgMembershipsTable = new dynamodb.Table(
    dataStack,
    "OrgMembershipsTable",
    {
        tableName: "dash-registry-OrgMemberships",
        partitionKey: { name: "orgId", type: dynamodb.AttributeType.STRING },
        sortKey: { name: "userId", type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.DESTROY,
    },
);

orgMembershipsTable.addGlobalSecondaryIndex({
    indexName: "ByUser",
    partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
    sortKey: { name: "orgId", type: dynamodb.AttributeType.STRING },
});

// Entitlements table — PK: entitlementId
// GSI "ByPackage": list all entitlements for a given package
// GSI "ByGrantee": list all entitlements granted to a user or org
const entitlementsTable = new dynamodb.Table(dataStack, "EntitlementsTable", {
    tableName: "dash-registry-Entitlements",
    partitionKey: {
        name: "entitlementId",
        type: dynamodb.AttributeType.STRING,
    },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.DESTROY,
});

entitlementsTable.addGlobalSecondaryIndex({
    indexName: "ByPackage",
    partitionKey: { name: "packageKey", type: dynamodb.AttributeType.STRING },
    sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
});

entitlementsTable.addGlobalSecondaryIndex({
    indexName: "ByGrantee",
    partitionKey: { name: "granteeKey", type: dynamodb.AttributeType.STRING },
    sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
});

// OrgDomains table — PK: orgId, SK: domain
// Stores domain claims + verification state. A verified domain grants
// every user whose email matches to the org's entitlements.
// GSI "ByDomain": reverse lookup for "which org owns this domain?"
const orgDomainsTable = new dynamodb.Table(dataStack, "OrgDomainsTable", {
    tableName: "dash-registry-OrgDomains",
    partitionKey: { name: "orgId", type: dynamodb.AttributeType.STRING },
    sortKey: { name: "domain", type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.DESTROY,
});

orgDomainsTable.addGlobalSecondaryIndex({
    indexName: "ByDomain",
    partitionKey: { name: "domain", type: dynamodb.AttributeType.STRING },
});

// InstallLog table — PK: userId, SK: requestedAt#entitlementId
// TTL: stored in `expiresAt` epoch seconds (90-day retention)
const installLogTable = new dynamodb.Table(dataStack, "InstallLogTable", {
    tableName: "dash-registry-InstallLog",
    partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
    sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    timeToLiveAttribute: "expiresAt",
    removalPolicy: RemovalPolicy.DESTROY,
});

// PublisherKeys table — PK: publisherId, SK: keyId
// One row per (publisher, machine) signing key. The same publisher may
// publish from multiple machines; each machine generates its own keypair
// and registers it via POST /api/publishers/keys/issue-cert. Revocation
// is per-key (leaked laptop = revoke just that key).
// GSI "ByFingerprint": revocation lookup at install time — installers
// query "is this fingerprint revoked?" before mounting a downloaded ZIP.
const publisherKeysTable = new dynamodb.Table(dataStack, "PublisherKeysTable", {
    tableName: "dash-registry-PublisherKeys",
    partitionKey: { name: "publisherId", type: dynamodb.AttributeType.STRING },
    sortKey: { name: "keyId", type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.DESTROY,
});

publisherKeysTable.addGlobalSecondaryIndex({
    indexName: "ByFingerprint",
    partitionKey: { name: "fingerprint", type: dynamodb.AttributeType.STRING },
});

// --- Outputs ---

backend.addOutput({
    custom: {
        usersTable: usersTable.tableName,
        packagesTable: packagesTable.tableName,
        packageVersionsTable: packageVersionsTable.tableName,
        userLibraryTable: userLibraryTable.tableName,
        deviceCodesTable: deviceCodesTable.tableName,
        orgsTable: orgsTable.tableName,
        orgMembershipsTable: orgMembershipsTable.tableName,
        orgDomainsTable: orgDomainsTable.tableName,
        entitlementsTable: entitlementsTable.tableName,
        installLogTable: installLogTable.tableName,
        publisherKeysTable: publisherKeysTable.tableName,
    },
});
