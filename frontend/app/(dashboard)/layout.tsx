"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthConfig } from "@/lib/queries";
import { Sidebar } from "@/components/layout/Sidebar";
import { colors } from "@/styles/theme";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuth();
  const { data: authConfig, isLoading: authLoading } = useAuthConfig();
  const router = useRouter();

  const authDisabled = authConfig?.auth_disabled ?? false;
  const allowed = authDisabled || isAuthenticated;

  // Auth guard: redirect to /login if auth is enabled and the user isn't authenticated.
  // While the auth-config is still loading we wait, so we don't bounce users when auth is off.
  useEffect(() => {
    if (!authLoading && !allowed) {
      router.push("/login");
    }
  }, [authLoading, allowed, router]);

  if (authLoading) return null;
  if (!allowed) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: colors.bgDeep }}>
      <Sidebar />
      <main
        role="main"
        style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}
      >
        {children}
      </main>
    </div>
  );
}
