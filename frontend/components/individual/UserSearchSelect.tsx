"use client";

import { useState } from "react";
import { colors } from "@/styles/theme";
import type { UserSummary } from "@/lib/api";

interface Props {
  users: UserSummary[];
  selected: string;
  onSelect: (userId: string) => void;
}

export function UserSearchSelect({ users, selected, onSelect }: Props) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? users.filter(
        (u) =>
          u.label.toLowerCase().includes(query.toLowerCase()) ||
          u.user_id.toLowerCase().includes(query.toLowerCase())
      )
    : users;

  return (
    <div style={{ maxWidth: 440 }}>
      <label
        htmlFor="user-search"
        style={{ display: "block", marginBottom: 6, fontSize: 12, color: colors.textSecondary }}
      >
        Search user
      </label>
      <input
        id="user-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by email or user ID…"
        data-testid="user-search-input"
        style={{ width: "100%", marginBottom: 10 }}
        aria-label="Search Kiro users"
      />

      {/* Listbox */}
      <div
        role="listbox"
        aria-label="Kiro users"
        style={{
          maxHeight: 220,
          overflowY: "auto",
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          backgroundColor: colors.bgElevated,
        }}
      >
        {filtered.length === 0 && (
          <p style={{ padding: 12, color: colors.textMuted, fontSize: 12 }}>No users found.</p>
        )}
        {filtered.map((u) => (
          <div
            key={u.user_id}
            role="option"
            aria-selected={selected === u.user_id}
            tabIndex={0}
            data-testid={`user-option-${u.user_id}`}
            onClick={() => onSelect(u.user_id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(u.user_id);
            }}
            style={{
              padding: "8px 12px",
              cursor: "pointer",
              backgroundColor: selected === u.user_id ? colors.accentBg : "transparent",
              borderLeft: selected === u.user_id
                ? `3px solid ${colors.accent}`
                : "3px solid transparent",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, color: colors.textPrimary }}>{u.label}</span>
            <span style={{ fontSize: 11, color: colors.textMuted }}>
              {u.adoption_score.toFixed(0)} pts
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
