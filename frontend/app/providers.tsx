"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { setToken } from "@/lib/api";

/** Syncs the auth context token into the api client on every render. */
function TokenSync() {
  const { token } = useAuth();
  useEffect(() => {
    setToken(token);
  }, [token]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TokenSync />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
