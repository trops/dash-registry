/**
 * amplifyOutputsOAuth.test.ts
 *
 * Regression pin for `amplify_outputs.json`'s OAuth section.
 *
 * The Amplify CLI (`npx ampx generate outputs`) regenerates this file
 * from `defineAuth` alone — but our GoogleOIDC identity provider AND
 * Cognito hosted-UI domain are added via CDK escape hatches in
 * `amplify/backend.ts`. The CLI doesn't see them, so a regeneration
 * silently zeros out `oauth.identity_providers` and `oauth.domain`.
 *
 * When that happens, the renderer's `signInWithGoogle` falls back to
 * `signInWithRedirect` with no oauth params and Amplify throws
 * `OAuthNotConfigureException`. Real-world fallout: every Google
 * sign-in fails post-deploy with no other warning.
 *
 * This test pins the two values to what the CDK actually deploys, so
 * if anyone runs `ampx generate outputs` and commits the regeneration
 * unchecked, CI fails loudly with the exact values to restore.
 *
 * If the deployed Cognito infra ever legitimately changes (new domain
 * prefix, new IDP), update both the CDK in `amplify/backend.ts` AND
 * this test in lockstep.
 */
import { describe, it, expect } from "vitest";

import outputs from "../../amplify_outputs.json";

// Must match `CfnUserPoolDomain` in amplify/backend.ts:132 — the
// fully-qualified hosted-UI hostname Amplify uses for /oauth2/authorize.
const EXPECTED_COGNITO_DOMAIN =
    "d6069e4afd3a4d6d6558.auth.us-east-1.amazoncognito.com";

// Must match `userPoolClient.supportedIdentityProviders` in
// amplify/backend.ts:107. We surface "GOOGLE" here because the
// amplify_outputs.json convention uses the all-caps short form even
// though the CDK provider name is "GoogleOIDC".
const EXPECTED_IDENTITY_PROVIDERS = ["GOOGLE"];

describe("amplify_outputs.json — OAuth config regression pin", () => {
    it("oauth.domain matches the CDK-deployed CfnUserPoolDomain", () => {
        const domain = (outputs as { auth?: { oauth?: { domain?: string } } })
            ?.auth?.oauth?.domain;
        expect(
            domain,
            `oauth.domain was wiped (likely by 'npx ampx generate outputs'). Restore to: "${EXPECTED_COGNITO_DOMAIN}"`,
        ).toBe(EXPECTED_COGNITO_DOMAIN);
    });

    it("oauth.identity_providers includes GOOGLE", () => {
        const providers = (
            outputs as {
                auth?: { oauth?: { identity_providers?: string[] } };
            }
        )?.auth?.oauth?.identity_providers;
        expect(
            providers,
            `oauth.identity_providers was wiped (likely by 'npx ampx generate outputs'). Restore to: ${JSON.stringify(EXPECTED_IDENTITY_PROVIDERS)}`,
        ).toEqual(EXPECTED_IDENTITY_PROVIDERS);
    });

    it("oauth.redirect_sign_in_uri includes localhost dev origins", () => {
        // Defensive: catches a regeneration that strips localhost
        // entries (e.g., if defineAuth ever ran with prod-only callbacks).
        const uris = (
            outputs as {
                auth?: { oauth?: { redirect_sign_in_uri?: string[] } };
            }
        )?.auth?.oauth?.redirect_sign_in_uri;
        expect(uris, "oauth.redirect_sign_in_uri is missing").toBeDefined();
        expect(uris).toContain("http://localhost:3000/");
    });
});
