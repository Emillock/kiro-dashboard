"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { colors } from "@/styles/theme";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: "⊞" },
  { href: "/individual", label: "Individual", icon: "👤" },
  { href: "/comparison", label: "Comparison", icon: "⇄" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <aside
      aria-label="Main navigation"
      style={{
        width: 220,
        minHeight: "100vh",
        backgroundColor: colors.bgPanel,
        borderRight: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        padding: "24px 0",
        flexShrink: 0,
      }}
    >
      {/* Logo / branding */}
      <div
        style={{
          padding: "0 20px 24px",
          borderBottom: `1px solid ${colors.border}`,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: colors.accentLight }}>
          🔮 Kiro Dashboard
        </span>
      </div>

      {/* Navigation links */}
      <nav style={{ flex: 1 }}>
        <ul role="list" style={{ listStyle: "none", padding: "0 8px" }}>
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <li key={href} style={{ marginBottom: 2 }}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  data-testid={`nav-${label.toLowerCase()}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 6,
                    textDecoration: "none",
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: active ? colors.textPrimary : colors.textSecondary,
                    backgroundColor: active ? colors.accentBg : "transparent",
                    borderLeft: active
                      ? `3px solid ${colors.accent}`
                      : "3px solid transparent",
                    transition: "background-color 0.12s",
                  }}
                >
                  <span aria-hidden="true">{icon}</span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div style={{ padding: "16px 16px 0" }}>
        <button
          onClick={handleLogout}
          data-testid="logout-button"
          style={{
            width: "100%",
            padding: "8px 12px",
            backgroundColor: "transparent",
            color: colors.textSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            fontSize: 12,
            textAlign: "left",
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
