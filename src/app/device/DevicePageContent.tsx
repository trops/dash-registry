"use client";

/**
 * DevicePageContent — shared content for /device and /device/[code] routes.
 *
 * Handles:
 * - Showing a loading state while auth resolves
 * - Rendering the Authenticator (email/password sign-in) when not authenticated
 * - Custom "Sign in with Google" button that passes customState for OAuth redirect
 * - Rendering the device authorization form when authenticated
 */
import { useState } from "react";
import { Authenticator, ThemeProvider } from "@aws-amplify/ui-react";
import { fetchAuthSession } from "aws-amplify/auth";
import { useAuth } from "@/components/AuthContext";
import AuthSync from "@/components/AuthSync";

const amplifyDarkTheme = {
    name: "dash-dark-device",
    tokens: {
        colors: {
            background: {
                primary: { value: "#0f1117" },
                secondary: { value: "#1a1d27" },
            },
            border: {
                primary: { value: "#2a2d3a" },
            },
            font: {
                primary: { value: "#e5e7eb" },
                secondary: { value: "#9ca3af" },
                interactive: { value: "#3b82f6" },
            },
            brand: {
                primary: {
                    10: { value: "#3b82f610" },
                    20: { value: "#3b82f620" },
                    40: { value: "#3b82f640" },
                    60: { value: "#3b82f660" },
                    80: { value: "#3b82f6" },
                    90: { value: "#60a5fa" },
                    100: { value: "#93c5fd" },
                },
            },
        },
        components: {
            authenticator: {
                router: {
                    borderWidth: { value: "0" },
                    backgroundColor: { value: "transparent" },
                },
            },
            button: {
                primary: {
                    backgroundColor: { value: "#3b82f6" },
                    _hover: {
                        backgroundColor: { value: "#2563eb" },
                    },
                },
            },
            fieldcontrol: {
                borderColor: { value: "#2a2d3a" },
                _focus: {
                    borderColor: { value: "#3b82f6" },
                },
            },
            tabs: {
                item: {
                    color: { value: "#9ca3af" },
                    _active: {
                        color: { value: "#3b82f6" },
                        borderColor: { value: "#3b82f6" },
                    },
                },
            },
        },
    },
};

function GoogleIcon() {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20">
            <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
            />
            <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
            />
            <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
            />
            <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
            />
        </svg>
    );
}

type AuthorizeStatus = "idle" | "loading" | "success" | "error";

function DeviceForm({ prefilled }: { prefilled: string }) {
    const [code, setCode] = useState(prefilled);
    const [status, setStatus] = useState<AuthorizeStatus>("idle");
    const [errorMessage, setErrorMessage] = useState("");

    async function handleAuthorize() {
        if (!code.trim()) return;
        setStatus("loading");
        setErrorMessage("");

        try {
            const session = await fetchAuthSession();
            const accessToken = session.tokens?.accessToken?.toString();

            if (!accessToken) {
                throw new Error("Could not retrieve access token");
            }

            const res = await fetch("/api/auth/device/authorize", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ userCode: code.trim().toUpperCase() }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(
                    data.error || `Authorization failed (${res.status})`,
                );
            }

            setStatus("success");
        } catch (err) {
            setStatus("error");
            setErrorMessage(
                err instanceof Error ? err.message : "Authorization failed",
            );
        }
    }

    if (status === "success") {
        return (
            <div className="text-center space-y-4">
                <div className="text-4xl">&#9989;</div>
                <h2 className="text-lg font-semibold text-white">
                    Device Authorized
                </h2>
                <p className="text-sm text-dash-muted">
                    Your Dash app is now connected. You can close this page and
                    return to the app.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <label
                    htmlFor="device-code"
                    className="block text-sm font-medium text-dash-muted mb-2"
                >
                    Device Code
                </label>
                <input
                    id="device-code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="ABCD1234"
                    className="w-full px-4 py-3 rounded-lg bg-dash-bg border border-dash-border text-white text-center text-2xl font-mono tracking-widest uppercase focus:outline-none focus:border-dash-accent"
                    maxLength={8}
                    autoFocus
                    disabled={status === "loading"}
                />
            </div>

            {status === "error" && errorMessage && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                    {errorMessage}
                </div>
            )}

            <p className="text-xs text-dash-muted text-center">
                This code expires in 15 minutes. If it has expired, restart the
                sign-in process in the Dash app.
            </p>

            <button
                type="button"
                onClick={handleAuthorize}
                disabled={!code.trim() || status === "loading"}
                className="w-full px-4 py-3 rounded-lg bg-dash-accent text-white font-medium hover:bg-dash-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {status === "loading" ? "Authorizing..." : "Authorize Device"}
            </button>
        </div>
    );
}

export default function DevicePageContent({
    prefilled = "",
}: {
    prefilled?: string;
}) {
    const { isAuthenticated, isLoading, signInWithGoogle } = useAuth();

    function handleGoogleSignIn() {
        const returnPath = prefilled ? `/device/${prefilled}` : "/device";
        signInWithGoogle(returnPath);
    }

    return (
        <div className="max-w-md mx-auto px-6 py-12">
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-white mb-2">
                    Connect Dash App
                </h1>
                <p className="text-dash-muted">
                    Enter the code shown in your Dash app to connect your
                    registry account.
                </p>
            </div>

            <div className="p-6 rounded-lg bg-dash-surface border border-dash-border">
                {isLoading ? (
                    <div className="text-center text-dash-muted py-4">
                        Checking authentication...
                    </div>
                ) : isAuthenticated ? (
                    <DeviceForm prefilled={prefilled} />
                ) : (
                    <div className="space-y-4">
                        {prefilled && (
                            <div className="text-center">
                                <p className="text-sm text-dash-muted mb-1">
                                    Authorizing device code
                                </p>
                                <p className="text-2xl font-mono font-bold text-white tracking-widest">
                                    {prefilled}
                                </p>
                            </div>
                        )}
                        <p className="text-sm text-dash-muted text-center mb-4">
                            Sign in to authorize your Dash app.
                        </p>

                        <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-white text-gray-800 font-medium hover:bg-gray-100 transition-colors"
                        >
                            <GoogleIcon />
                            Sign in with Google
                        </button>

                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-dash-border" />
                            <span className="text-xs text-dash-muted">or</span>
                            <div className="flex-1 h-px bg-dash-border" />
                        </div>

                        <ThemeProvider
                            theme={amplifyDarkTheme}
                            colorMode="dark"
                        >
                            <Authenticator hideSignUp socialProviders={[]}>
                                {() => <AuthSync>Loading...</AuthSync>}
                            </Authenticator>
                        </ThemeProvider>
                    </div>
                )}
            </div>
        </div>
    );
}
