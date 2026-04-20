/**
 * OAuth authorize-step proxy for our Cognito "GoogleOIDC" IDP.
 *
 * Why this endpoint exists: Cognito's OIDC IDP type gives us no way to
 * inject `prompt=select_account` into the upstream Google authorize
 * request. `authorize_request_extra_params` is SAML-only, and
 * `authorize_url` cannot contain a query string ("OIDC endpoint can not
 * contain queries"). So our IDP's `authorize_url` points here instead
 * of directly at Google. Cognito hands us its OAuth query params, we
 * append `prompt=select_account`, and 302 to Google.
 *
 * Token exchange and userinfo still happen between Cognito and Google
 * directly (via `oidc_issuer` auto-discovery) — this endpoint only sits
 * on the authorize hop. It's stateless and performs no token handling.
 */
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_AUTHORIZE =
    "https://accounts.google.com/o/oauth2/v2/auth";

export function GET(request: NextRequest) {
    const google = new URL(GOOGLE_AUTHORIZE);
    request.nextUrl.searchParams.forEach((value, key) => {
        google.searchParams.set(key, value);
    });
    google.searchParams.set("prompt", "select_account");
    return NextResponse.redirect(google, 302);
}
