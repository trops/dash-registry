/**
 * Amplify Data — DynamoDB Models
 *
 * Defines the data models for the registry:
 * - User: Registry user profiles
 * - Package: Widget/dashboard package metadata
 * - PackageVersion: Version history with download URLs
 * - UserLibrary: User's installed packages for cross-device sync
 */
import { defineData } from "@aws-amplify/backend";
import { a } from "@aws-amplify/backend";

const schema = a.schema({
    User: a
        .model({
            cognitoId: a.string().required(),
            username: a.string().required(),
            email: a.string().required(),
            githubUsername: a.string(),
            displayName: a.string().required(),
            avatarUrl: a.string(),
        })
        .identifier(["cognitoId"])
        .authorization((allow) => [
            allow.owner(),
            allow.guest().to(["read"]),
            allow.authenticated().to(["read"]),
        ]),

    Package: a
        .model({
            scope: a.string().required(),
            name: a.string().required(),
            displayName: a.string().required(),
            author: a.string().required(),
            description: a.string(),
            type: a.enum(["widget", "dashboard"]),
            category: a.string(),
            tags: a.string().array(),
            icon: a.string(),
            latestVersion: a.string().required(),
            repository: a.string(),
            visibility: a.enum(["public", "private"]),
            ownerId: a.string().required(),
            downloadUrl: a.string(),
        })
        .identifier(["scope", "name"])
        .authorization((allow) => [
            allow.owner().to(["create", "update", "delete", "read"]),
            allow.guest().to(["read"]),
            allow.authenticated().to(["read"]),
        ]),

    PackageVersion: a
        .model({
            packageScope: a.string().required(),
            packageName: a.string().required(),
            version: a.string().required(),
            downloadUrl: a.string().required(),
            manifest: a.json().required(),
            widgets: a.json().array(),
            providers: a.json().array(),
            eventWiring: a.json().array(),
            fileSize: a.integer(),
        })
        .identifier(["packageScope", "packageName", "version"])
        .authorization((allow) => [
            allow.owner().to(["create", "read"]),
            allow.guest().to(["read"]),
            allow.authenticated().to(["read"]),
        ]),

    UserLibrary: a
        .model({
            userId: a.string().required(),
            packageScope: a.string().required(),
            packageName: a.string().required(),
            installedVersion: a.string().required(),
            source: a.enum(["registry", "sideload"]),
        })
        .identifier(["userId", "packageScope", "packageName"])
        .authorization((allow) => [allow.owner()]),
});

export const data = defineData({
    schema,
    authorizationModes: {
        defaultAuthorizationMode: "iam",
    },
});
