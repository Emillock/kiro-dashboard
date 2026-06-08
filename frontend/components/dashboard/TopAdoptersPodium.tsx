import { Trophy, Medal, Award } from "lucide-react";
import { colors } from "@/styles/theme";
import type { TopAdopter } from "@/lib/api";
import { AdoptionScoreInfo } from "@/components/common/AdoptionScoreInfo";

const RANK_BORDERS: Record<number, string> = {
  1: colors.gold,
  2: colors.silver,
  3: colors.bronze,
};

const RANK_LABELS: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
};

const RANK_ICONS: Record<number, typeof Trophy> = {
  1: Trophy,
  2: Medal,
  3: Award,
};

export function TopAdoptersPodium({ adopters }: { adopters: TopAdopter[] }) {
  if (!adopters.length) {
    return (
      <p style={{ fontSize: 12, color: colors.textMuted }}>No data available.</p>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
        Top Adopters by AI Adoption Score
        <AdoptionScoreInfo />
      </p>
      <ol role="list" style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {adopters.map((a) => {
          const borderColor = RANK_BORDERS[a.rank] ?? colors.border;
          const RankIcon: typeof Trophy | undefined = RANK_ICONS[a.rank];
          const rankLabel = RANK_LABELS[a.rank];
          return (
            <li
              key={a.user_id}
              data-testid={`top-adopter-rank-${a.rank}`}
              className={a.rank === 1 ? "neon-glow" : undefined}
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
                  minWidth: 48,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 13,
                  fontWeight: 700,
                  color: borderColor,
                }}
              >
                {RankIcon ? (
                  <>
                    <RankIcon size={16} strokeWidth={2.2} aria-hidden="true" />
                    {rankLabel}
                  </>
                ) : (
                  <span aria-hidden="true">{`#${a.rank}`}</span>
                )}
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
