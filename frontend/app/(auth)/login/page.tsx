"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { colors } from "@/styles/theme";

export default function LoginPage() {
  const router = useRouter();
  const { login: authLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login({ email, password });
      authLogin(res.access_token);
      router.push("/");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.bgDeep,
      }}
    >
      <div
        style={{
          width: 360,
          padding: 32,
          backgroundColor: colors.bgPanel,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            marginBottom: 24,
            color: colors.textPrimary,
          }}
          className="neon-text"
        >
          Sign in to Kiro Dashboard
        </h1>

        <form onSubmit={handleSubmit} data-testid="login-form">
          <label
            htmlFor="email"
            style={{ display: "block", marginBottom: 6, color: colors.textSecondary, fontSize: 12 }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="login-email-input"
            style={{ width: "100%", marginBottom: 16 }}
            placeholder="user22@example.com"
          />

          <label
            htmlFor="password"
            style={{ display: "block", marginBottom: 6, color: colors.textSecondary, fontSize: 12 }}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="login-password-input"
            style={{ width: "100%", marginBottom: 24 }}
          />

          {error && (
            <p style={{ color: colors.error, fontSize: 12, marginBottom: 16 }} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit-button"
            className="neon-btn"
            style={{
              width: "100%",
              padding: "10px 0",
              backgroundColor: loading ? colors.textMuted : colors.accent,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 12, color: colors.textSecondary, textAlign: "center" }}>
          No account?{" "}
          <Link href="/register" style={{ color: colors.accentLight }}>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
