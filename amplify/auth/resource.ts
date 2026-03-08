/**
 * Amplify Auth — Cognito Configuration
 *
 * Configures user pools with email/password login.
 * Google OAuth is deferred until SSM secrets are configured.
 */
import { defineAuth } from "@aws-amplify/backend";

export const auth = defineAuth({
    loginWith: {
        email: {
            verificationEmailStyle: "CODE",
            verificationEmailSubject: "Dash Registry - Verify your email",
        },
    },
    userAttributes: {
        email: { required: true },
        preferredUsername: { required: false },
        profilePicture: { required: false },
    },
});
