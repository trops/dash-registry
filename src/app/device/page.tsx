"use client";

/**
 * Device verification page — where users complete the device code flow.
 *
 * The Dash app displays a code, user visits this page in their browser,
 * signs in, and enters the code to authorize the app.
 */
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type AuthorizeStatus = "idle" | "loading" | "success" | "error";

function DeviceForm() {
    const searchParams = useSearchParams();
    const prefilled = searchParams.get("code") || "";

    const [code, setCode] = useState(prefilled);
    const [status, setStatus] = useState<AuthorizeStatus>("idle");
    const [errorMessage, setErrorMessage] = useState("");

    async function handleAuthorize() {
        if (!code.trim()) return;
        setStatus("loading");
        setErrorMessage("");

        try {
            const res = await fetch("/api/auth/device/authorize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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

            <p className="text-xs text-dash-muted text-center">
                You must be signed in to authorize a device. If you don&apos;t
                have an account,{" "}
                <a
                    href="/account"
                    className="text-dash-accent hover:underline"
                >
                    create one first
                </a>
                .
            </p>
        </div>
    );
}

export default function DevicePage() {
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
                <Suspense
                    fallback={
                        <div className="text-center text-dash-muted py-4">
                            Loading...
                        </div>
                    }
                >
                    <DeviceForm />
                </Suspense>
            </div>
        </div>
    );
}
