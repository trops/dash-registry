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

// --- Outputs ---

backend.addOutput({
    custom: {
        usersTable: usersTable.tableName,
        packagesTable: packagesTable.tableName,
        packageVersionsTable: packageVersionsTable.tableName,
        userLibraryTable: userLibraryTable.tableName,
        deviceCodesTable: deviceCodesTable.tableName,
    },
});
