/**
 * Amplify client configuration.
 *
 * Uses NEXT_PUBLIC_* env vars for Cognito and OAuth config.
 * These values come from amplify_outputs.json and are set
 * in .env.local (dev) and Amplify Hosting env vars (prod).
 */
import { type ResourcesConfig } from "aws-amplify";

const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "",
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "",
      identityPoolId: process.env.NEXT_PUBLIC_IDENTITY_POOL_ID || "",
      loginWith: {
        oauth: {
          domain: process.env.NEXT_PUBLIC_OAUTH_DOMAIN || "",
          scopes: [
            "email",
            "openid",
            "profile",
            "aws.cognito.signin.user.admin",
          ],
          redirectSignIn: [
            process.env.NEXT_PUBLIC_REDIRECT_SIGN_IN ||
              "http://localhost:3000/",
          ],
          redirectSignOut: [
            process.env.NEXT_PUBLIC_REDIRECT_SIGN_OUT ||
              "http://localhost:3000/",
          ],
          responseType: "code",
          providers: ["Google"],
        },
      },
    },
  },
};

export default amplifyConfig;
