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

const redirectSignIn =
    process.env.NEXT_PUBLIC_REDIRECT_SIGN_IN || "http://localhost:3001/";
const redirectSignOut =
    process.env.NEXT_PUBLIC_REDIRECT_SIGN_OUT || "http://localhost:3001/";

const config = {
    ...outputs,
    auth: {
        ...outputs.auth,
        oauth: {
            ...outputs.auth.oauth,
            redirect_sign_in_uri: [redirectSignIn],
            redirect_sign_out_uri: [redirectSignOut],
        },
    },
};

let configured = false;

export default function AmplifyProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [ready, setReady] = useState(configured);

    useEffect(() => {
        if (!configured) {
            Amplify.configure(config, { ssr: true });
            configured = true;
        }
        setReady(true);
    }, []);

    if (!ready) return null;
    return <>{children}</>;
}
