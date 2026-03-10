"use client";

/**
 * DeviceReturnHandler — client-side redirect after OAuth sign-in.
 *
 * Rendered in the root layout. When the user completes OAuth (Google sign-in),
 * Amplify redirects to "/". This component reads the `oauthReturnPath` from
 * AuthContext (set via Amplify Hub's `customOAuthState` event) and uses
 * Next.js router.replace() to navigate back to the device page without
 * a full page reload (preserving auth state).
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

export default function DeviceReturnHandler() {
    const { isAuthenticated, isLoading, oauthReturnPath, clearOAuthReturnPath } =
        useAuth();
    const router = useRouter();

    useEffect(() => {
        console.log("[DeviceReturnHandler]", { isLoading, isAuthenticated, oauthReturnPath });
        if (isLoading) return;
        if (!isAuthenticated) return;
        if (!oauthReturnPath) return;

        // Only redirect to /device paths for security
        if (!oauthReturnPath.startsWith("/device")) {
            clearOAuthReturnPath();
            return;
        }

        clearOAuthReturnPath();
        router.replace(oauthReturnPath);
    }, [isAuthenticated, isLoading, oauthReturnPath, clearOAuthReturnPath, router]);

    return null;
}
