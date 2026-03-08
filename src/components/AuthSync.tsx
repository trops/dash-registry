"use client";

/**
 * AuthSync — triggers an auth context refresh when mounted.
 *
 * Used inside the Authenticator's children render prop to sync
 * Cognito auth state with AuthContext without calling setState during render.
 */
import { useEffect } from "react";
import { useAuth } from "@/components/AuthContext";

export default function AuthSync({
    children,
}: {
    children?: React.ReactNode;
}) {
    const { refreshAuth } = useAuth();

    useEffect(() => {
        refreshAuth();
    }, [refreshAuth]);

    return (
        <>
            {children || (
                <div className="text-center text-dash-muted py-4">
                    Loading your profile...
                </div>
            )}
        </>
    );
}
