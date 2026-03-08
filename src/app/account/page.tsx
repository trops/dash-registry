"use client";

/**
 * Account page — user dashboard showing published packages and profile.
 *
 * Phase 1: Users can register a username and see their profile.
 * When Amplify Cognito UI is deployed, this will include full sign-in/sign-up.
 * For now, the page shows registration form for users who have a Cognito token
 * (from device flow or direct API usage).
 */
import { useState, useEffect } from "react";

interface UserProfile {
    cognitoId: string;
    username: string;
    email: string;
    displayName: string;
    githubUsername?: string;
    avatarUrl?: string;
    createdAt?: string;
}

export default function AccountPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [showRegister, setShowRegister] = useState(false);

    // Registration form
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [registerError, setRegisterError] = useState("");
    const [registerSuccess, setRegisterSuccess] = useState(false);

    return (
        <div className="max-w-4xl mx-auto px-6 py-12">
            <h1 className="text-3xl font-bold text-white mb-6">Account</h1>

            {/* Profile Display (when available) */}
            {profile ? (
                <div className="space-y-6">
                    <div className="p-6 rounded-lg bg-dash-surface border border-dash-border">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-16 h-16 rounded-full bg-dash-accent/20 flex items-center justify-center text-2xl text-dash-accent">
                                {profile.displayName?.charAt(0).toUpperCase() ||
                                    "?"}
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-white">
                                    {profile.displayName}
                                </h2>
                                <p className="text-sm text-dash-muted">
                                    @{profile.username}
                                </p>
                                <p className="text-xs text-dash-muted mt-1">
                                    {profile.email}
                                </p>
                            </div>
                        </div>
                        {profile.createdAt && (
                            <p className="text-xs text-dash-muted">
                                Member since{" "}
                                {new Date(
                                    profile.createdAt,
                                ).toLocaleDateString()}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 rounded-lg bg-dash-surface border border-dash-border">
                            <div className="text-2xl mb-2">&#128230;</div>
                            <h4 className="text-sm font-semibold text-white">
                                Published Packages
                            </h4>
                            <p className="text-xs text-dash-muted mt-1">
                                Publish from the Dash app to see your packages
                                here
                            </p>
                        </div>
                        <div className="p-4 rounded-lg bg-dash-surface border border-dash-border">
                            <div className="text-2xl mb-2">&#128203;</div>
                            <h4 className="text-sm font-semibold text-white">
                                Library
                            </h4>
                            <p className="text-xs text-dash-muted mt-1">
                                Track your installed packages across devices
                            </p>
                        </div>
                        <div className="p-4 rounded-lg bg-dash-surface border border-dash-border">
                            <div className="text-2xl mb-2">&#128736;</div>
                            <h4 className="text-sm font-semibold text-white">
                                Settings
                            </h4>
                            <p className="text-xs text-dash-muted mt-1">
                                Manage your profile and username
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                /* Sign-in / Registration */
                <div className="space-y-6">
                    <div className="p-8 rounded-lg bg-dash-surface border border-dash-border text-center">
                        <div className="text-4xl mb-4">&#128100;</div>
                        <h2 className="text-xl font-semibold text-white mb-2">
                            Registry Account
                        </h2>
                        <p className="text-dash-muted mb-6 max-w-md mx-auto">
                            Sign in to manage your published packages, view
                            download stats, and sync your library across
                            devices.
                        </p>

                        <div className="space-y-4">
                            <div className="p-4 rounded-lg bg-dash-bg border border-dash-border">
                                <h3 className="text-sm font-semibold text-white mb-2">
                                    Sign In
                                </h3>
                                <p className="text-xs text-dash-muted mb-3">
                                    Account sign-in with email, GitHub, and
                                    Google will be available once the registry
                                    service is deployed to AWS Amplify. For now,
                                    you can publish dashboards from the Dash app
                                    after connecting your account via the device
                                    code flow.
                                </p>
                                <div className="flex flex-col items-center gap-2">
                                    <span className="text-xs text-dash-muted">
                                        To connect your Dash app, use the
                                        &quot;Sign in to Registry&quot; button
                                        in the Publish Dashboard flow.
                                    </span>
                                </div>
                            </div>

                            {/* Registration Form (for users who obtained a token via device flow) */}
                            {showRegister && (
                                <div className="p-4 rounded-lg bg-dash-bg border border-dash-border text-left">
                                    <h3 className="text-sm font-semibold text-white mb-3">
                                        Choose Your Username
                                    </h3>
                                    <p className="text-xs text-dash-muted mb-3">
                                        Your username becomes the scope for all
                                        published packages (e.g.,
                                        @yourname/my-widgets). It must be
                                        lowercase, start with a letter, and
                                        contain only letters, numbers, and
                                        hyphens.
                                    </p>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs text-dash-muted mb-1">
                                                Username *
                                            </label>
                                            <input
                                                type="text"
                                                value={username}
                                                onChange={(e) =>
                                                    setUsername(
                                                        e.target.value.toLowerCase(),
                                                    )
                                                }
                                                placeholder="your-username"
                                                className="w-full px-3 py-2 rounded-lg bg-dash-surface border border-dash-border text-white text-sm focus:outline-none focus:border-dash-accent"
                                                maxLength={39}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-dash-muted mb-1">
                                                Display Name
                                            </label>
                                            <input
                                                type="text"
                                                value={displayName}
                                                onChange={(e) =>
                                                    setDisplayName(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Your Name"
                                                className="w-full px-3 py-2 rounded-lg bg-dash-surface border border-dash-border text-white text-sm focus:outline-none focus:border-dash-accent"
                                            />
                                        </div>
                                        {registerError && (
                                            <p className="text-xs text-red-400">
                                                {registerError}
                                            </p>
                                        )}
                                        {registerSuccess && (
                                            <p className="text-xs text-green-400">
                                                Registration successful! Your
                                                username is @{username}.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                                <div className="p-4 rounded-lg bg-dash-bg border border-dash-border">
                                    <div className="text-2xl mb-2">
                                        &#128230;
                                    </div>
                                    <h4 className="text-sm font-semibold text-white">
                                        Published Packages
                                    </h4>
                                    <p className="text-xs text-dash-muted mt-1">
                                        View and manage your published widgets
                                        and dashboards
                                    </p>
                                </div>
                                <div className="p-4 rounded-lg bg-dash-bg border border-dash-border">
                                    <div className="text-2xl mb-2">
                                        &#128203;
                                    </div>
                                    <h4 className="text-sm font-semibold text-white">
                                        Library
                                    </h4>
                                    <p className="text-xs text-dash-muted mt-1">
                                        Track your installed packages across
                                        devices
                                    </p>
                                </div>
                                <div className="p-4 rounded-lg bg-dash-bg border border-dash-border">
                                    <div className="text-2xl mb-2">
                                        &#128736;
                                    </div>
                                    <h4 className="text-sm font-semibold text-white">
                                        Settings
                                    </h4>
                                    <p className="text-xs text-dash-muted mt-1">
                                        Manage your profile and username
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
