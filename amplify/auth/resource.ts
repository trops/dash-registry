/**
 * Amplify Auth — Cognito Configuration
 *
 * Configures user pools with email/password, GitHub OAuth, and Google OAuth.
 * Supports device flow for Dash app authentication.
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
                scopes: ["email", "profile"],
            },
            callbackUrls: [
                "http://localhost:3000/api/auth/callback",
                "https://registry.trops.dev/api/auth/callback",
            ],
            logoutUrls: [
                "http://localhost:3000",
                "https://registry.trops.dev",
            ],
        },
    },
    userAttributes: {
        email: { required: true },
        preferredUsername: { required: false },
        profilePicture: { required: false },
    },
});
