"use client";

/**
 * JWT auth context. Stores token in localStorage and provides login/logout helpers.
 * Any page under the dashboard layout checks this context and redirects to /login if unauthenticated.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";

const TOKEN_KEY = "kiro_dashboard_token";

interface AuthContextValue {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  login: () => {},
  logout: () => {},
  isAuthenticated: false,
});

/** Read the stored token at initialisation time (client only, safe on server). */
function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Lazy initialisers run only on the client so localStorage access is safe.
  const [token, setToken] = useState<string | null>(readStoredToken);
  // hydrated is always true after the first render because the lazy initialiser
  // already ran synchronously — no effect needed.
  const [hydrated] = useState(true);

  const login = useCallback((newToken: string) => {
    setToken(newToken);
    localStorage.setItem(TOKEN_KEY, newToken);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
  }, []);

  // Don't render children until hydration completes to avoid flash.
  if (!hydrated) return null;

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
