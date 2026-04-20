/**
 * Amplify Auth — Cognito Configuration
 *
 * Email/password login only here. Google social sign-in is attached
 * manually in `amplify/backend.ts` as a raw OIDC IDP so we can force
 * `prompt=select_account` via `authorize_request_extra_params` — a
 * capability Cognito's native Google IDP type does not support.
 *
 * Rationale: when this was an Amplify-managed native Google IDP, CFN
 * refused the required type change in-place ("custom-named resource
 * requires replacing"). Declaring it outside Amplify's factory gives it
 * a fresh CFN logical ID and dodges that restriction entirely.
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
