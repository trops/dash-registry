/**
 * DynamoDB client and table helpers.
 *
 * Table names are set via environment variables (injected by Amplify).
 * Fallback names are used for local development.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import outputs from "../../amplify_outputs.json";

const custom = (outputs as Record<string, unknown>).custom as
  | Record<string, string>
  | undefined;

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLES = {
  USERS: process.env.USERS_TABLE || custom?.usersTable || "dash-registry-Users",
  PACKAGES:
    process.env.PACKAGES_TABLE ||
    custom?.packagesTable ||
    "dash-registry-Packages",
  PACKAGE_VERSIONS:
    process.env.PACKAGE_VERSIONS_TABLE ||
    custom?.packageVersionsTable ||
    "dash-registry-PackageVersions",
  USER_LIBRARY:
    process.env.USER_LIBRARY_TABLE ||
    custom?.userLibraryTable ||
    "dash-registry-UserLibrary",
  DEVICE_CODES:
    process.env.DEVICE_CODES_TABLE ||
    custom?.deviceCodesTable ||
    "dash-registry-DeviceCodes",
};

// --- User operations ---

export async function getUserByUsername(username: string) {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLES.USERS,
      FilterExpression: "username = :u",
      ExpressionAttributeValues: { ":u": username },
      Limit: 1,
    }),
  );
  return result.Items?.[0] || null;
}

export async function getUserByCognitoId(cognitoId: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLES.USERS,
      Key: { cognitoId },
    }),
  );
  return result.Item || null;
}

export async function createUser(user: {
  cognitoId: string;
  username: string;
  email: string;
  displayName: string;
  githubUsername?: string;
  avatarUrl?: string;
}) {
  const now = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: TABLES.USERS,
      Item: { ...user, createdAt: now, updatedAt: now },
      ConditionExpression: "attribute_not_exists(cognitoId)",
    }),
  );
  return user;
}

export async function updateUser(
  cognitoId: string,
  updates: { displayName?: string; githubUsername?: string },
) {
  const now = new Date().toISOString();
  const expressionParts: string[] = ["#updatedAt = :updatedAt"];
  const names: Record<string, string> = { "#updatedAt": "updatedAt" };
  const values: Record<string, unknown> = { ":updatedAt": now };

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      const attr = `#${key}`;
      const placeholder = `:${key}`;
      expressionParts.push(`${attr} = ${placeholder}`);
      names[attr] = key;
      values[placeholder] = val;
    }
  }

  if (expressionParts.length === 1) return null; // nothing to update besides timestamp

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.USERS,
      Key: { cognitoId },
      UpdateExpression: `SET ${expressionParts.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );
  return result.Attributes;
}

// --- Package operations ---

export async function getPackage(scope: string, name: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLES.PACKAGES,
      Key: { scope, name },
    }),
  );
  return result.Item || null;
}

export async function putPackage(pkg: Record<string, unknown>) {
  const now = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: TABLES.PACKAGES,
      Item: { ...pkg, updatedAt: now },
    }),
  );
}

export async function listPackages(filters?: {
  search?: string;
  category?: string;
  type?: string;
  appOrigin?: string;
}) {
  const filterParts: string[] = ["visibility = :vis"];
  const exprValues: Record<string, string> = { ":vis": "public" };
  const exprNames: Record<string, string> = {};

  if (filters?.category) {
    filterParts.push("category = :cat");
    exprValues[":cat"] = filters.category;
  }
  if (filters?.type) {
    filterParts.push("#t = :type");
    exprNames["#t"] = "type";
    exprValues[":type"] = filters.type;
  }
  if (filters?.appOrigin) {
    filterParts.push("appOrigin = :appOrigin");
    exprValues[":appOrigin"] = filters.appOrigin;
  }

  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLES.PACKAGES,
      FilterExpression: filterParts.join(" AND "),
      ExpressionAttributeValues: exprValues,
      ...(Object.keys(exprNames).length > 0 && {
        ExpressionAttributeNames: exprNames,
      }),
    }),
  );

  let packages = result.Items || [];

  // Client-side text search (DynamoDB doesn't support full-text)
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    packages = packages.filter(
      (pkg) =>
        (pkg.name as string)?.toLowerCase().includes(q) ||
        (pkg.displayName as string)?.toLowerCase().includes(q) ||
        (pkg.description as string)?.toLowerCase().includes(q) ||
        (pkg.author as string)?.toLowerCase().includes(q) ||
        ((pkg.tags as string[]) || []).some((t) => t.toLowerCase().includes(q)),
    );
  }

  return packages;
}

export async function listPackagesByScope(scope: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.PACKAGES,
      KeyConditionExpression: "#s = :scope",
      ExpressionAttributeNames: { "#s": "scope" },
      ExpressionAttributeValues: { ":scope": scope },
    }),
  );
  return result.Items || [];
}

export async function updatePackage(
  scope: string,
  name: string,
  updates: {
    description?: string;
    category?: string;
    tags?: string[];
    visibility?: string;
    displayName?: string;
  },
) {
  const now = new Date().toISOString();
  const expressionParts: string[] = ["#updatedAt = :updatedAt"];
  const names: Record<string, string> = { "#updatedAt": "updatedAt" };
  const values: Record<string, unknown> = { ":updatedAt": now };

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      const attr = `#${key}`;
      const placeholder = `:${key}`;
      expressionParts.push(`${attr} = ${placeholder}`);
      names[attr] = key;
      values[placeholder] = val;
    }
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.PACKAGES,
      Key: { scope, name },
      UpdateExpression: `SET ${expressionParts.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );
  return result.Attributes;
}

// --- PackageVersion operations ---

export async function putPackageVersion(version: Record<string, unknown>) {
  const now = new Date().toISOString();
  const sk = `${version.packageName}#${version.version}`;
  await docClient.send(
    new PutCommand({
      TableName: TABLES.PACKAGE_VERSIONS,
      Item: { ...version, sk, createdAt: now },
    }),
  );
}

export async function getPackageVersions(scope: string, name: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.PACKAGE_VERSIONS,
      KeyConditionExpression:
        "packageScope = :scope AND begins_with(sk, :namePrefix)",
      ExpressionAttributeValues: {
        ":scope": scope,
        ":namePrefix": `${name}#`,
      },
    }),
  );
  return result.Items || [];
}

export async function deletePackage(scope: string, name: string) {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLES.PACKAGES,
      Key: { scope, name },
    }),
  );
}

export async function deletePackageVersions(scope: string, name: string) {
  const versions = await getPackageVersions(scope, name);
  for (const v of versions) {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLES.PACKAGE_VERSIONS,
        Key: { packageScope: scope, sk: v.sk as string },
      }),
    );
  }
  return versions;
}

// --- UserLibrary operations ---

export async function putUserLibraryEntry(entry: Record<string, unknown>) {
  const now = new Date().toISOString();
  const sk = `${entry.packageScope}#${entry.packageName}`;
  await docClient.send(
    new PutCommand({
      TableName: TABLES.USER_LIBRARY,
      Item: { ...entry, sk, updatedAt: now, installedAt: now },
    }),
  );
}

export async function getUserLibrary(userId: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.USER_LIBRARY,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    }),
  );
  return result.Items || [];
}
