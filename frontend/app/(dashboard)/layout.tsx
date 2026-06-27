"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthConfig } from "@/lib/queries";
import { Sidebar } from "@/components/layout/Sidebar";
import { colors } from "@/styles/theme";

/** Viewport width (px) below which the sidebar auto-collapses. */
const SIDEBAR_BREAKPOINT = 1024;

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

  // Sidebar open/closed state. Initialised on mount from the current viewport width.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  // Auto open/close the sidebar as the window is resized (or shrinking).
  // A manual toggle is respected until the viewport crosses the breakpoint again.
  useEffect(() => {
    let wasNarrow = window.innerWidth < SIDEBAR_BREAKPOINT;

    function syncToViewport(initial: boolean) {
      const isNarrow = window.innerWidth < SIDEBAR_BREAKPOINT;
      if (initial || isNarrow !== wasNarrow) {
        setSidebarOpen(!isNarrow);
      }
      wasNarrow = isNarrow;
    }

    syncToViewport(true);
    const onResize = () => syncToViewport(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      <main
        role="main"
        style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}
      >
        {children}
      </main>
    </div>
  );
}
