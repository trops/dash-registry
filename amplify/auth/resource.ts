/**
 * Amplify Auth — Cognito Configuration
 *
 * Configures user pools with email/password login and Google social sign-in.
 * Google OAuth credentials are stored as SSM secrets via `npx ampx sandbox secret set`.
 */
import { defineAuth, secret } from "@aws-amplify/backend";

export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: "CODE",
      verificationEmailSubject: "Dash Registry - Verify your email",
    },
    externalProviders: {
      google: {
        clientId: secret("GOOGLE_CLIENT_ID"),
        clientSecret: secret("GOOGLE_CLIENT_SECRET"),
        scopes: ["EMAIL", "PROFILE"],
        attributeMapping: {
          email: "email",
          fullname: "name",
          profilePicture: "picture",
        },
      },
      callbackUrls: [
        "https://main.d919rwhuzp7rj.amplifyapp.com/",
        "http://localhost:3000/",
      ],
      logoutUrls: [
        "https://main.d919rwhuzp7rj.amplifyapp.com/",
        "http://localhost:3000/",
      ],
    },
  },
  userAttributes: {
    email: { required: true },
    preferredUsername: { required: false },
    profilePicture: { required: false },
  },
});
