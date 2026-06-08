"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/lib/api";
import { colors } from "@/styles/theme";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (username.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    setLoading(true);
    try {
      await register({ email, username, password });
      router.push("/login?registered=1");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed.";
      setError(msg.includes("409") ? "Email or username already in use." : msg);
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
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, color: colors.textPrimary }} className="neon-text">
          Create an account
        </h1>

        <form onSubmit={handleSubmit} data-testid="register-form">
          {[
            { id: "email", label: "Email", type: "email", value: email, setter: setEmail, placeholder: "user22@example.com", autoComplete: "email", testid: "register-email-input" },
            { id: "username", label: "Username", type: "text", value: username, setter: setUsername, placeholder: "min 3 characters", autoComplete: "username", testid: "register-username-input" },
            { id: "password", label: "Password", type: "password", value: password, setter: setPassword, placeholder: "min 8 characters", autoComplete: "new-password", testid: "register-password-input" },
          ].map(({ id, label, type, value, setter, placeholder, autoComplete, testid }) => (
            <div key={id} style={{ marginBottom: 16 }}>
              <label
                htmlFor={id}
                style={{ display: "block", marginBottom: 6, color: colors.textSecondary, fontSize: 12 }}
              >
                {label}
              </label>
              <input
                id={id}
                type={type}
                autoComplete={autoComplete}
                required
                value={value}
                onChange={(e) => setter(e.target.value)}
                data-testid={testid}
                style={{ width: "100%" }}
                placeholder={placeholder}
              />
            </div>
          ))}

          {error && (
            <p style={{ color: colors.error, fontSize: 12, marginBottom: 16 }} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            data-testid="register-submit-button"
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
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 12, color: colors.textSecondary, textAlign: "center" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: colors.accentLight }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
