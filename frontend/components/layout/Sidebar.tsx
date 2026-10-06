"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  Compass,
  User,
  ArrowLeftRight,
  Gem,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthConfig } from "@/lib/queries";
import { colors } from "@/styles/theme";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/insights", label: "Insights", icon: Compass },
  { href: "/individual", label: "Individual", icon: User },
  { href: "/comparison", label: "Comparison", icon: ArrowLeftRight },
];

/** Width of the sidebar when expanded. Shared with the layout so main content can offset correctly. */
export const SIDEBAR_WIDTH = 220;

interface SidebarProps {
  /** Whether the sidebar is expanded (true) or collapsed (false). Defaults to open. */
  isOpen?: boolean;
  /** Toggle handler for the open/close control. */
  onToggle?: () => void;
}

export function Sidebar({ isOpen = true, onToggle = () => {} }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { data: authConfig } = useAuthConfig();
  const authDisabled = authConfig?.auth_disabled ?? false;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <>
      {/* Floating open control — visible only when the sidebar is collapsed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          aria-label="Open navigation"
          aria-expanded={false}
          data-testid="sidebar-toggle"
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            backgroundColor: colors.bgPanel,
            color: colors.textSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          <PanelLeftOpen size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      )}

      <aside
        aria-label="Main navigation"
        aria-hidden={!isOpen}
        style={{
          width: isOpen ? SIDEBAR_WIDTH : 0,
          minHeight: "100vh",
          backgroundColor: colors.bgPanel,
          borderRight: isOpen ? `1px solid ${colors.border}` : "none",
          display: "flex",
          flexDirection: "column",
          padding: isOpen ? "24px 0" : 0,
          flexShrink: 0,
          overflow: "hidden",
          transition: "width 0.2s ease, padding 0.2s ease",
        }}
      >
        {/* Logo / branding + close control */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "0 16px 24px 20px",
            borderBottom: `1px solid ${colors.border}`,
            marginBottom: 16,
          }}
        >
          <span
            className="neon-text"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 15,
              fontWeight: 700,
              color: colors.accentLight,
              whiteSpace: "nowrap",
            }}
          >
            <Gem size={18} strokeWidth={2.2} aria-hidden="true" />
            Kiro Dashboard
          </span>
          <button
            onClick={onToggle}
            aria-label="Close navigation"
            aria-expanded={true}
            data-testid="sidebar-toggle"
            tabIndex={isOpen ? 0 : -1}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              backgroundColor: "transparent",
              color: colors.textMuted,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <PanelLeftClose size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {/* Navigation links */}
        <nav style={{ flex: 1 }}>
          <ul role="list" style={{ listStyle: "none", padding: "0 8px" }}>
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <li key={href} style={{ marginBottom: 2 }}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    data-testid={`nav-${label.toLowerCase()}`}
                    tabIndex={isOpen ? 0 : -1}
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
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Icon
                      size={16}
                      strokeWidth={2}
                      aria-hidden="true"
                      style={{ color: active ? colors.accentLight : colors.textMuted, flexShrink: 0 }}
                    />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Logout (hidden when auth is disabled — there's no session to end) */}
        {!authDisabled && (
          <div style={{ padding: "16px 16px 0" }}>
            <button
              onClick={handleLogout}
              data-testid="logout-button"
              tabIndex={isOpen ? 0 : -1}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                backgroundColor: "transparent",
                color: colors.textSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                fontSize: 12,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              <LogOut size={14} strokeWidth={2} aria-hidden="true" />
              Sign out
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
