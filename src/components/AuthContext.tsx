"use client";

/**
 * AuthContext — exposes Cognito auth state to the component tree.
 *
 * Provides: user, isAuthenticated, isLoading, signOut, getAccessToken
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
    type AuthUser,
} from "aws-amplify/auth";

interface AuthState {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    signOut: () => Promise<void>;
    getAccessToken: () => Promise<string | null>;
    refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    signOut: async () => {},
    getAccessToken: async () => null,
    refreshAuth: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

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

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    const signOut = useCallback(async () => {
        await amplifySignOut();
        setUser(null);
    }, []);

    const getAccessToken = useCallback(async (): Promise<string | null> => {
        try {
            const session = await fetchAuthSession();
            return (
                session.tokens?.accessToken?.toString() ?? null
            );
        } catch {
            return null;
        }
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: !!user,
                isLoading,
                signOut,
                getAccessToken,
                refreshAuth: checkAuth,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
