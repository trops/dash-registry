"use client";

/**
 * AuthContext — exposes Cognito auth state to the component tree.
 *
 * Provides: user, isAuthenticated, isLoading, profile, signOut, getAccessToken
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  fetchAuthSession,
  getCurrentUser,
  signOut as amplifySignOut,
  signInWithRedirect,
  type AuthUser,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

// Extract OAuth return path from the callback URL before Amplify clears it.
// The OAuth state parameter format is {random}-{hex_encoded_custom_state}.
// This runs at module load time — synchronously, before any React rendering
// or Amplify.configure() — guaranteeing the URL still has its query params.
let _earlyOAuthReturnPath: string | null = null;
if (typeof window !== "undefined") {
    const _params = new URLSearchParams(window.location.search);
    const _state = _params.get("state");
    if (_state && _params.has("code")) {
        const _dashIdx = _state.lastIndexOf("-");
        if (_dashIdx !== -1) {
            try {
                const _hex = _state.substring(_dashIdx + 1);
                _earlyOAuthReturnPath =
                    _hex
                        .match(/.{2}/g)
                        ?.map((c) => String.fromCharCode(parseInt(c, 16)))
                        .join("") ?? null;
            } catch {
                // ignore decode errors
            }
        }
    }
    console.log("[AuthContext:module]", {
        search: window.location.search.substring(0, 80),
        extractedPath: _earlyOAuthReturnPath,
    });

    // Early Hub listener — catches auth events fired before React mounts
    Hub.listen("auth", ({ payload }) => {
        console.log("[AuthContext:earlyHub]", payload.event, (payload as Record<string, unknown>).data);
    });
}

export interface UserProfile {
  cognitoId: string;
  username: string;
  email: string;
  displayName: string;
  githubUsername?: string;
  avatarUrl?: string;
  createdAt?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  profile: UserProfile | null;
  profileLoading: boolean;
  oauthReturnPath: string | null;
  signOut: () => Promise<void>;
  signInWithGoogle: (customState?: string) => void;
  getAccessToken: () => Promise<string | null>;
  refreshAuth: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  clearOAuthReturnPath: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  profile: null,
  profileLoading: false,
  oauthReturnPath: null,
  signOut: async () => {},
  signInWithGoogle: () => {},
  getAccessToken: async () => null,
  refreshAuth: async () => {},
  fetchProfile: async () => {},
  clearOAuthReturnPath: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [oauthReturnPath, setOauthReturnPath] = useState<string | null>(() => {
    if (_earlyOAuthReturnPath) {
      const path = _earlyOAuthReturnPath;
      _earlyOAuthReturnPath = null;
      return path;
    }
    return null;
  });

  const clearOAuthReturnPath = useCallback(() => {
    setOauthReturnPath(null);
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.accessToken?.toString() ?? null;
    } catch {
      return null;
    }
  }, []);

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
        setProfile(data.user);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    } finally {
      setProfileLoading(false);
    }
  }, [getAccessToken]);

  const checkAuth = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser();
      console.log("[AuthContext] checkAuth: user found", currentUser.username);
      setUser(currentUser);
    } catch {
      console.log("[AuthContext] checkAuth: no user");
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch profile when user becomes authenticated
  useEffect(() => {
    if (user) {
      fetchProfile();
    } else {
      setProfile(null);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      const hubPayload = payload as Record<string, unknown>;
      console.log("[AuthContext:hub]", payload.event, hubPayload.data);
      switch (payload.event) {
        case "customOAuthState":
          setOauthReturnPath(hubPayload.data as string);
          break;
        case "signInWithRedirect":
          checkAuth();
          break;
        case "signedIn":
          checkAuth();
          break;
        case "signedOut":
          setUser(null);
          break;
        case "signInWithRedirect_failure":
          console.error("OAuth sign-in failed:", payload.data);
          setUser(null);
          setIsLoading(false);
          break;
      }
    });
    return unsubscribe;
  }, [checkAuth]);

  const signOut = useCallback(async () => {
    await amplifySignOut();
    setUser(null);
    setProfile(null);
  }, []);

  const signInWithGoogle = useCallback((customState?: string) => {
    signInWithRedirect({ provider: "Google", customState });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        profile,
        profileLoading,
        oauthReturnPath,
        signOut,
        signInWithGoogle,
        getAccessToken,
        refreshAuth: checkAuth,
        fetchProfile,
        clearOAuthReturnPath,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
