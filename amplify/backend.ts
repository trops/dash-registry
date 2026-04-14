/**
 * Amplify Backend — Root Definition
 *
 * Combines auth + storage from Amplify, then creates DynamoDB tables
 * via CDK escape hatch. We bypass Amplify Data (AppSync) because its
 * composite sort keys are incompatible with the raw SDK calls in db.ts.
 */
import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { storage } from "./storage/resource";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";

const backend = defineBackend({
    auth,
    storage,
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
