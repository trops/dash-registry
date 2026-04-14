/**
 * Cognito user-attribute lookup helper.
 *
 * Access tokens (what we authenticate API requests with) don't include
 * all user attributes — notably email and picture when the user signed
 * up via federated OAuth (Google). This helper calls the Cognito
 * AdminGetUser API to fetch the canonical attribute values from the
 * user pool, so we can backfill our Users table with data that was
 * missed at registration.
 *
 * Requires cognito-idp:AdminGetUser permission on the Lambda role.
 */
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import outputs from "../../amplify_outputs.json";

const USER_POOL_ID =
  process.env.COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id || "";

let client: CognitoIdentityProviderClient | null = null;

function getClient() {
  if (!client) {
    client = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return client;
}

export interface CognitoUserAttributes {
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * Fetch user attributes from Cognito by sub (cognitoId). Returns null
 * on error rather than throwing so callers can fall back gracefully.
 */
export async function getCognitoUserAttributes(
  cognitoId: string,
): Promise<CognitoUserAttributes | null> {
  if (!USER_POOL_ID) return null;
  try {
    const res = await getClient().send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: cognitoId,
      }),
    );
    const out: CognitoUserAttributes = {};
    for (const attr of res.UserAttributes || []) {
      if (!attr.Name) continue;
      if (attr.Name === "email") out.email = attr.Value;
      else if (attr.Name === "email_verified")
        out.emailVerified = attr.Value === "true";
      else if (attr.Name === "name") out.name = attr.Value;
      else if (attr.Name === "picture") out.picture = attr.Value;
    }
    return out;
  } catch (err) {
    console.warn(
      "[cognito] AdminGetUser failed (falling back to stored values):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
