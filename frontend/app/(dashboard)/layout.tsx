"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/layout/Sidebar";
import { colors } from "@/styles/theme";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  // Auth guard: redirect to /login if not authenticated (US-AUTH-03).
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

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
