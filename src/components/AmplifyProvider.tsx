"use client";

/**
 * AmplifyProvider — configures aws-amplify for the client side.
 *
 * Must be rendered once near the top of the component tree so that
 * all downstream hooks (fetchAuthSession, getCurrentUser, etc.) work.
 */
import { useEffect, useState } from "react";
import { Amplify } from "aws-amplify";
import outputs from "../../amplify_outputs.json";

let configured = false;

export default function AmplifyProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [ready, setReady] = useState(configured);

    useEffect(() => {
        if (!configured) {
            // Clear stale OAuth in-flight state when this isn't an OAuth
            // redirect (no ?code= in URL). Prevents "redirect is coming from
            // a different origin" errors from previous incomplete flows.
            const params = new URLSearchParams(window.location.search);
            const isOAuthCallback = params.has("code") && params.has("state");
            const clientId = outputs.auth.user_pool_client_id;
            const prefix = `CognitoIdentityServiceProvider.${clientId}`;

            console.log("[AmplifyProvider]", {
                isOAuthCallback,
                search: window.location.search.substring(0, 80),
                inflightOAuth: localStorage.getItem(`${prefix}.inflightOAuth`),
                oauthState: localStorage.getItem(`${prefix}.oauthState`)?.substring(0, 40),
                oauthPKCE: !!localStorage.getItem(`${prefix}.oauthPKCE`),
            });

            if (!isOAuthCallback) {
                try {
                    localStorage.removeItem(`${prefix}.inflightOAuth`);
                    localStorage.removeItem(`${prefix}.oauthPKCE`);
                    localStorage.removeItem(`${prefix}.oauthState`);
                } catch {
                    // storage unavailable
                }
            }

            const origin = window.location.origin + "/";
            const redirectSignIn =
                process.env.NEXT_PUBLIC_REDIRECT_SIGN_IN || origin;
            const redirectSignOut =
                process.env.NEXT_PUBLIC_REDIRECT_SIGN_OUT || origin;

            Amplify.configure({
                ...outputs,
                auth: {
                    ...outputs.auth,
                    oauth: {
                        ...outputs.auth.oauth,
                        redirect_sign_in_uri: [redirectSignIn],
                        redirect_sign_out_uri: [redirectSignOut],
                    },
                },
            });
            configured = true;
        }
        setReady(true);
    }, []);

    if (!ready) return null;
    return <>{children}</>;
}
