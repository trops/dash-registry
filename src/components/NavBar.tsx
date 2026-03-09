"use client";

/**
 * NavBar — auth-aware navigation bar.
 *
 * Shows "Sign In" when unauthenticated, user initial + sign-out when authenticated.
 */
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";

export default function NavBar() {
    const { user, isAuthenticated, isLoading, signOut } = useAuth();

    return (
        <nav className="border-b border-dash-border bg-dash-surface/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                <Link href="/" className="flex items-center space-x-2">
                    <span className="text-xl font-bold text-white">
                        Dash Registry
                    </span>
                </Link>
                <div className="flex items-center space-x-6 text-sm">
                    <Link
                        href="/"
                        className="text-dash-muted hover:text-white transition-colors"
                    >
                        Browse
                    </Link>
                    <Link
                        href="/submit"
                        className="text-dash-muted hover:text-white transition-colors"
                    >
                        Publish
                    </Link>
                    <Link
                        href="/account"
                        className="text-dash-muted hover:text-white transition-colors"
                    >
                        Account
                    </Link>
                    <a
                        href="https://github.com/trops/dash"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-dash-muted hover:text-white transition-colors"
                    >
                        GitHub
                    </a>

                    {/* Auth status */}
                    {!isLoading && isAuthenticated && (
                        <button
                            onClick={() => signOut()}
                            className="text-dash-muted hover:text-red-400 border border-dash-border rounded px-2 py-1 transition-colors"
                        >
                            Sign Out
                        </button>
                    )}
                </div>
            </div>
        </nav>
    );
}
