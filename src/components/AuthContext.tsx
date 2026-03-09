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
  signOut: () => Promise<void>;
  signInWithGoogle: () => void;
  getAccessToken: () => Promise<string | null>;
  refreshAuth: () => Promise<void>;
  fetchProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  profile: null,
  profileLoading: false,
  signOut: async () => {},
  signInWithGoogle: () => {},
  getAccessToken: async () => null,
  refreshAuth: async () => {},
  fetchProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

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
      setUser(currentUser);
    } catch {
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
      switch (payload.event) {
        case "signInWithRedirect":
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

  const signInWithGoogle = useCallback(() => {
    signInWithRedirect({ provider: "Google" });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        profile,
        profileLoading,
        signOut,
        signInWithGoogle,
        getAccessToken,
        refreshAuth: checkAuth,
        fetchProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
