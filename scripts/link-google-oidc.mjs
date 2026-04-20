/**
 * One-time migration: attach the new "GoogleOIDC" provider identity
 * to every existing pool user who was federated via the old native
 * "Google" IDP. After this runs, signing in through GoogleOIDC with
 * the same Google sub resolves to the existing pool user — so every
 * dash-registry record keyed on `cognitoId` stays attached.
 *
 * Idempotent: re-running after a successful link produces a benign
 * `ResourceConflictException` which is swallowed.
 *
 * Usage:   node scripts/link-google-oidc.mjs
 */
import {
    CognitoIdentityProviderClient,
    ListUsersCommand,
    AdminLinkProviderForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const USER_POOL_ID = "us-east-1_oIS59FIu7";
const client = new CognitoIdentityProviderClient({ region: "us-east-1" });

async function listAllUsers() {
    const users = [];
    let token;
    do {
        const r = await client.send(
            new ListUsersCommand({
                UserPoolId: USER_POOL_ID,
                Limit: 60,
                PaginationToken: token,
            }),
        );
        users.push(...(r.Users ?? []));
        token = r.PaginationToken;
    } while (token);
    return users;
}

function attr(user, name) {
    return user.Attributes?.find((a) => a.Name === name)?.Value;
}

async function linkUser(googleSub, email) {
    try {
        await client.send(
            new AdminLinkProviderForUserCommand({
                UserPoolId: USER_POOL_ID,
                DestinationUser: {
                    ProviderName: "Google",
                    ProviderAttributeName: "Cognito_Subject",
                    ProviderAttributeValue: googleSub,
                },
                SourceUser: {
                    ProviderName: "GoogleOIDC",
                    ProviderAttributeName: "Cognito_Subject",
                    ProviderAttributeValue: googleSub,
                },
            }),
        );
        console.log(`  linked ${email} (sub ${googleSub})`);
    } catch (e) {
        // Cognito returns either ResourceConflictException or
        // InvalidParameterException("SourceUser is already linked...")
        // depending on whether the destination already has *any* link
        // to the source, or specifically this one — both mean "done".
        const alreadyLinked =
            e.name === "ResourceConflictException" ||
            (e.name === "InvalidParameterException" &&
                /already linked/i.test(e.message ?? ""));
        if (alreadyLinked) {
            console.log(`  already linked ${email} (sub ${googleSub})`);
            return;
        }
        throw e;
    }
}

async function main() {
    console.log(`Listing users in pool ${USER_POOL_ID}...`);
    const users = await listAllUsers();
    const googleUsers = users.filter((u) => {
        const raw = attr(u, "identities");
        if (!raw) return false;
        try {
            return JSON.parse(raw).some((i) => i.providerName === "Google");
        } catch {
            return false;
        }
    });
    console.log(
        `Found ${googleUsers.length} user(s) federated via native Google IDP.`,
    );
    for (const u of googleUsers) {
        const email = attr(u, "email") ?? "(no email)";
        const identities = JSON.parse(attr(u, "identities"));
        const googleIdentity = identities.find(
            (i) => i.providerName === "Google",
        );
        await linkUser(googleIdentity.userId, email);
    }
    console.log("Done.");
}

main().catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
});
