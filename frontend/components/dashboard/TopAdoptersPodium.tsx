import { colors } from "@/styles/theme";
import type { TopAdopter } from "@/lib/api";

const RANK_BORDERS: Record<number, string> = {
  1: colors.gold,
  2: colors.silver,
  3: colors.bronze,
};

const RANK_LABELS: Record<number, string> = {
  1: "🥇 1st",
  2: "🥈 2nd",
  3: "🥉 3rd",
};

export function TopAdoptersPodium({ adopters }: { adopters: TopAdopter[] }) {
  if (!adopters.length) {
    return (
      <p style={{ fontSize: 12, color: colors.textMuted }}>No data available.</p>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12, fontWeight: 600 }}>
        Top Adopters by AI Adoption Score
      </p>
      <ol role="list" style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {adopters.map((a) => {
          const borderColor = RANK_BORDERS[a.rank] ?? colors.border;
          const rankLabel = RANK_LABELS[a.rank] ?? `#${a.rank}`;
          return (
            <li
              key={a.user_id}
              data-testid={`top-adopter-rank-${a.rank}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                backgroundColor: colors.bgElevated,
                border: `2px solid ${borderColor}`,
                borderRadius: 8,
              }}
            >
              <span
                aria-label={`Rank ${a.rank}`}
                style={{
                  minWidth: 40,
                  fontSize: 13,
                  fontWeight: 700,
                  color: borderColor,
                }}
              >
                {rankLabel}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: colors.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.label}
              </span>
              <span style={{ fontSize: 12, color: colors.textSecondary, whiteSpace: "nowrap" }}>
                {a.adoption_score.toFixed(1)} pts
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
