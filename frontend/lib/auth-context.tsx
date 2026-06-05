"use client";

/**
 * JWT auth context. Stores token in localStorage and provides login/logout helpers.
 * Any page under the dashboard layout checks this context and redirects to /login if unauthenticated.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount (client only).
  useEffect(() => {
    const stored = typeof window !== "undefined"
      ? localStorage.getItem(TOKEN_KEY)
      : null;
    if (stored) setToken(stored);
    setHydrated(true);
  }, []);

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
