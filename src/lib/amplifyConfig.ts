/**
 * Amplify client configuration.
 *
 * Uses NEXT_PUBLIC_* env vars for Cognito config.
 * These values come from amplify_outputs.json and are set
 * in .env.local (dev) and Amplify Hosting env vars (prod).
 */
import { type ResourcesConfig } from "aws-amplify";

const amplifyConfig: ResourcesConfig = {
    Auth: {
        Cognito: {
            userPoolId:
                process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "",
            userPoolClientId:
                process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "",
            identityPoolId:
                process.env.NEXT_PUBLIC_IDENTITY_POOL_ID || "",
        },
    },
};

export default amplifyConfig;
