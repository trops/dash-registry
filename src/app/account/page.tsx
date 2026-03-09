"use client";

/**
 * Account page — user dashboard with Cognito sign-in/sign-up.
 *
 * Uses the Amplify Authenticator for email/password auth.
 * After sign-in, fetches user profile from /api/auth/me.
 * If no profile exists (new user), shows registration form.
 */
import { useState, useEffect, useCallback } from "react";
import { Authenticator, ThemeProvider } from "@aws-amplify/ui-react";
import { useAuth } from "@/components/AuthContext";
import AuthSync from "@/components/AuthSync";

const amplifyDarkTheme = {
  name: "dash-dark",
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
          borderWidth: { value: "1px" },
          borderColor: { value: "#2a2d3a" },
          backgroundColor: { value: "#1a1d27" },
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
  const { isAuthenticated, isLoading: authLoading, getAccessToken } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  // Registration form
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [registering, setRegistering] = useState(false);

  const fetchProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;

      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setShowRegister(false);
      } else if (res.status === 404) {
        // User authenticated but not registered — show registration form
        setShowRegister(true);
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    } finally {
      setProfileLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile();
    } else {
      setProfile(null);
      setShowRegister(false);
    }
  }, [isAuthenticated, fetchProfile]);

  async function handleRegister() {
    if (!username.trim()) {
      setRegisterError("Username is required");
      return;
    }

    setRegistering(true);
    setRegisterError("");

    try {
      const token = await getAccessToken();
      if (!token) {
        setRegisterError("Not authenticated");
        return;
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: username.trim(),
          displayName: displayName.trim() || username.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Registration failed");
      }

      setRegisterSuccess(true);
      // Reload profile after registration
      await fetchProfile();
    } catch (err) {
      setRegisterError(
        err instanceof Error ? err.message : "Registration failed",
      );
    } finally {
      setRegistering(false);
    }
  }

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-white mb-6">Account</h1>
        <div className="text-dash-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-6">Account</h1>

      {/* Authenticated: show profile or registration */}
      {isAuthenticated && profile ? (
        <div className="space-y-6">
          <div className="p-6 rounded-lg bg-dash-surface border border-dash-border">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-dash-accent/20 flex items-center justify-center text-2xl text-dash-accent">
                {profile.displayName?.charAt(0).toUpperCase() || "?"}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {profile.displayName}
                </h2>
                <p className="text-sm text-dash-muted">@{profile.username}</p>
                <p className="text-xs text-dash-muted mt-1">{profile.email}</p>
              </div>
            </div>
            {profile.createdAt && (
              <p className="text-xs text-dash-muted">
                Member since {new Date(profile.createdAt).toLocaleDateString()}
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
                Publish from the Dash app to see your packages here
              </p>
            </div>
            <div className="p-4 rounded-lg bg-dash-surface border border-dash-border">
              <div className="text-2xl mb-2">&#128203;</div>
              <h4 className="text-sm font-semibold text-white">Library</h4>
              <p className="text-xs text-dash-muted mt-1">
                Track your installed packages across devices
              </p>
            </div>
            <div className="p-4 rounded-lg bg-dash-surface border border-dash-border">
              <div className="text-2xl mb-2">&#128736;</div>
              <h4 className="text-sm font-semibold text-white">Settings</h4>
              <p className="text-xs text-dash-muted mt-1">
                Manage your profile and username
              </p>
            </div>
          </div>
        </div>
      ) : isAuthenticated && showRegister ? (
        /* Authenticated but no profile — show registration */
        <div className="space-y-6">
          <div className="p-6 rounded-lg bg-dash-surface border border-dash-border">
            <h2 className="text-xl font-semibold text-white mb-2">
              Complete Your Registration
            </h2>
            <p className="text-sm text-dash-muted mb-6">
              Choose a username to get started. Your username becomes the scope
              for all published packages (e.g., @yourname/my-widgets).
            </p>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs text-dash-muted mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="your-username"
                  className="w-full px-3 py-2 rounded-lg bg-dash-bg border border-dash-border text-white text-sm focus:outline-none focus:border-dash-accent"
                  maxLength={39}
                />
                <p className="text-xs text-dash-muted mt-1">
                  Lowercase, starts with a letter, only letters, numbers, and
                  hyphens.
                </p>
              </div>
              <div>
                <label className="block text-xs text-dash-muted mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full px-3 py-2 rounded-lg bg-dash-bg border border-dash-border text-white text-sm focus:outline-none focus:border-dash-accent"
                />
              </div>
              {registerError && (
                <p className="text-xs text-red-400">{registerError}</p>
              )}
              {registerSuccess && (
                <p className="text-xs text-green-400">
                  Registration successful! Your username is @{username}.
                </p>
              )}
              <button
                type="button"
                onClick={handleRegister}
                disabled={!username.trim() || registering}
                className="px-4 py-2 rounded-lg bg-dash-accent text-white font-medium hover:bg-dash-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {registering ? "Registering..." : "Register Username"}
              </button>
            </div>
          </div>
        </div>
      ) : isAuthenticated && profileLoading ? (
        <div className="text-dash-muted">Loading profile...</div>
      ) : (
        /* Not authenticated — show Authenticator */
        <div className="space-y-6">
          <div className="p-8 rounded-lg bg-dash-surface border border-dash-border">
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">&#128100;</div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Registry Account
              </h2>
              <p className="text-dash-muted max-w-md mx-auto">
                Sign in to manage your published packages, view download stats,
                and sync your library across devices.
              </p>
            </div>

            <ThemeProvider theme={amplifyDarkTheme} colorMode="dark">
              <Authenticator
                signUpAttributes={["email"]}
                socialProviders={["google"]}
                components={{
                  SignIn: {
                    Footer() {
                      return (
                        <div className="text-center text-xs text-dash-muted pb-4">
                          You can also sign in from the Dash app using the
                          device code flow.
                        </div>
                      );
                    },
                  },
                }}
              >
                {() => <AuthSync />}
              </Authenticator>
            </ThemeProvider>
          </div>
        </div>
      )}
    </div>
  );
}
