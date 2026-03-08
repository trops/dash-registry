"use client";

/**
 * AmplifyProvider — configures aws-amplify for the client side.
 *
 * Must be rendered once near the top of the component tree so that
 * all downstream hooks (fetchAuthSession, getCurrentUser, etc.) work.
 */
import { useEffect, useState } from "react";
import { Amplify } from "aws-amplify";
import amplifyConfig from "@/lib/amplifyConfig";

let configured = false;

export default function AmplifyProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [ready, setReady] = useState(configured);

    useEffect(() => {
        if (!configured) {
            Amplify.configure(amplifyConfig, { ssr: true });
            configured = true;
        }
        setReady(true);
    }, []);

    if (!ready) return null;
    return <>{children}</>;
}
