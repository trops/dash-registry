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
import { CfnUserPoolIdentityProvider } from "aws-cdk-lib/aws-cognito";
import { RemovalPolicy } from "aws-cdk-lib";
import { execSync } from "node:child_process";

/**
 * Resolve an SSM SecureString parameter synchronously at CDK synth time.
 *
 * Cognito IDP ProviderDetails rejects CloudFormation dynamic references
 * (`{{resolve:ssm-secure:...}}`) for client_id / client_secret — we
 * verified this: CFN errors with "SSM Secure reference is not supported
 * in: [AWS::Cognito::UserPoolIdentityProvider/.../client_secret, .../client_id]".
 * So we have to bake concrete values into the synthesized template.
 *
 * The template ends up in `.amplify/artifacts/cdk.out/` (gitignored,
 * local to the developer's machine). Secrets stay in SSM Parameter
 * Store as the source of truth; they just also appear in the on-disk
 * template for the duration of a deploy.
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

// Google identity provider — defined as a raw OIDC IDP here rather than
// via Amplify's native `google` factory.
//
// Why not Amplify's factory: Cognito's native-Google IDP type silently
// drops `authorize_request_extra_params` and `authorize_url` query
// params (confirmed via AWS CLI). That means we can't pass
// `prompt=select_account` through to Google, and every sign-in
// silently reuses Google's browser session instead of showing the
// account picker. Cognito's OIDC IDP type **does** honor those params.
//
// Why as a fresh resource and not an in-place `addPropertyOverride`
// on Amplify's IDP: changing ProviderType on a CFN resource requires
// replacement (delete + create), and CFN refuses to replace a
// custom-named resource in a single update. The previous IDP (logical
// id `amplifyAuthGoogleIdPA9736819`) was deleted manually in AWS as a
// one-time migration step; by declaring a new resource with a
// different logical id here, CFN has no replacement to perform — it
// just creates it fresh.
//
// The ProviderName stays exactly "Google" so Cognito's federated
// identity records (keyed on `{providerName, providerUserId}`) still
// match existing users. Google's OIDC `sub` is the same value native
// Google IDP stored, so no user-record loss on first sign-in.
const googleIdp = new CfnUserPoolIdentityProvider(
    backend.auth.stack,
    "GoogleOidcIdp",
    {
        userPoolId: backend.auth.resources.userPool.userPoolId,
        providerName: "Google",
        providerType: "OIDC",
        // Secrets live in SSM (set by `ampx sandbox secret set GOOGLE_*`).
        // Resolved at synth time because CFN rejects dynamic references
        // for these fields — see readSsmSecureString() comment.
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
            // CFN requires a JSON-encoded string, not an object —
            // passing {prompt: "select_account"} directly produces:
            //   #/ProviderDetails/authorize_request_extra_params:
            //     expected type: String, found: JSONObject
            authorize_request_extra_params: JSON.stringify({
                prompt: "select_account",
            }),
        },
        attributeMapping: {
            email: "email",
            name: "name",
            picture: "picture",
            username: "sub",
        },
    },
);

// Amplify's factory no longer adds "Google" to the User Pool Client's
// SupportedIdentityProviders list (since we removed `google` from
// externalProviders in auth/resource.ts). Re-add it via CDK override
// so Amplify's hosted UI will accept `identity_provider=Google` on
// /oauth2/authorize and forward to our new OIDC IDP.
const userPoolClient = backend.auth.resources.cfnResources.cfnUserPoolClient;
userPoolClient.supportedIdentityProviders = ["COGNITO", "Google"];
// Explicit dependency so the client update waits for the IDP to exist
// — otherwise CFN may try to set SupportedIdentityProviders=["Google"]
// before the IDP is created, failing with "Invalid IdP".
userPoolClient.addDependency(googleIdp);

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
    },
});
