/**
 * Feature: insights-section, Property 14: Dormant_User classification is stable and idempotent
 *
 * Property 14 (design.md): For all users, a user is classified as dormant if and
 * only if `subscription_tier` is non-null AND the active-day count is at or below
 * the single configured threshold (applied identically to every user), and
 * re-running the classification on the same data yields an identical set.
 *
 * Validates: Requirements 5.5, 5.6
 *
 * The function under test is `computeEngagementInsights({ dailyTotals, userMetrics }, config)`
 * from lib/insights/engagement.ts. The dormant-users insight has id
 * `engagement-dormant-users`:
 *   - `detail.threshold` always carries the configured threshold;
 *   - `detail.dormantCount` is the number of dormant users;
 *   - when `dormantCount > 0`, `detail.userIds` is the `", "`-joined ascending
 *     list of dormant user ids and `magnitude` equals the count;
 *   - when `dormantCount === 0`, there is no `userIds` field and `magnitude` is 0.
 *
 * Classification (Requirements 5.5/5.6): a user is dormant iff
 * `subscription_tier !== null` AND `active_days <= config.dormantActiveDayThreshold`,
 * with the identical threshold applied to every user.
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeEngagementInsights } from "../lib/insights/engagement";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type { InsightConfig, UserMetrics } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const DORMANT_ID = "engagement-dormant-users";

/**
 * Build minimal-but-valid per-user metrics. Only `user_id`,
 * `subscription_tier`, and `active_days` participate in dormant classification;
 * every other required field is filled with a benign zero/empty value so the
 * record type-checks without influencing the result.
 */
function makeUser(
  userId: string,
  subscriptionTier: string | null,
  activeDays: number,
): UserMetrics {
  return {
    user_id: userId,
    label: userId,
    total_messages: 0,
    chat_conversations: 0,
    credits_used: 0,
    active_days: activeDays,
    model_messages: {},
    subscription_tier: subscriptionTier,
    adoption_score: 0,
    daily_breakdown: [],
  };
}

/**
 * Generate a set of users with DISTINCT user ids drawn from a comma-free
 * alphabet (so the comma-joined `detail.userIds` round-trips unambiguously
 * through `split(",")`), varied `subscription_tier` (both `null` and several
 * non-null tiers, so the tier condition is exercised on both sides), and INTEGER
 * `active_days` spanning a small range around the threshold values used below.
 */
const userId = (): fc.Arbitrary<string> =>
  fc.string({
    unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
    minLength: 1,
    maxLength: 6,
  });

const subscriptionTier = (): fc.Arbitrary<string | null> =>
  fc.oneof(
    fc.constant(null),
    fc.constantFrom("free", "pro", "team", "enterprise"),
  );

const userSets = (): fc.Arbitrary<UserMetrics[]> =>
  fc
    .uniqueArray(
      fc.record({
        userId: userId(),
        tier: subscriptionTier(),
        // active_days spans 0..8, straddling the thresholds tested (0..6).
        activeDays: fc.integer({ min: 0, max: 8 }),
      }),
      { minLength: 0, maxLength: 25, selector: (u) => u.userId },
    )
    .map((rows) =>
      rows.map((r) => makeUser(r.userId, r.tier, r.activeDays)),
    );

/** A config identical to the default except for the dormant threshold. */
function configWithThreshold(threshold: number): InsightConfig {
  return { ...DEFAULT_INSIGHT_CONFIG, dormantActiveDayThreshold: threshold };
}

/**
 * Independent oracle: the dormant set is exactly the users whose
 * `subscription_tier` is non-null AND whose `active_days` is at or below the
 * threshold, returned as ids in the implementation's ascending order. The
 * implementation sorts with the default (lexicographic) comparator, so the
 * oracle mirrors that with `[...].sort()`.
 */
function expectedDormant(users: UserMetrics[], threshold: number): string[] {
  return users
    .filter((u) => u.subscription_tier !== null && u.active_days <= threshold)
    .map((u) => u.user_id)
    .sort();
}

/** Read the listed dormant ids from the insight (empty when none). */
function listedDormant(detail: Record<string, number | string>): string[] {
  const ids = detail.userIds;
  if (typeof ids !== "string" || ids === "") return [];
  // The implementation joins ids with ", " (comma + space).
  return ids.split(", ");
}

// ── Property 14: membership iff condition (default threshold) ────────────────

test("Property 14: dormant set equals exactly {tier != null AND active_days <= threshold} (default threshold)", () => {
  fc.assert(
    fc.property(userSets(), (users) => {
      const config = DEFAULT_INSIGHT_CONFIG;
      const insights = computeEngagementInsights(
        { dailyTotals: [], userMetrics: users },
        config,
      );
      const insight = insights.find((i) => i.id === DORMANT_ID);
      expect(insight).toBeDefined();
      expect(insight!.status).toBe("ok");

      // The reported threshold is the single configured threshold (R5.6).
      expect(insight!.detail!.threshold).toBe(config.dormantActiveDayThreshold);

      const listed = listedDormant(insight!.detail!);
      const expected = expectedDormant(users, config.dormantActiveDayThreshold);

      // Membership iff the classification condition holds, AND ascending order:
      // exact array equality captures both at once.
      expect(listed).toEqual(expected);
      expect(insight!.detail!.dormantCount).toBe(expected.length);
      expect(insight!.magnitude).toBe(expected.length);
    }),
    { numRuns: RUNS },
  );
});

// ── Property 14: membership iff condition (custom configurable threshold) ────

test("Property 14: a single configurable threshold is applied identically to every user", () => {
  fc.assert(
    fc.property(
      userSets(),
      fc.integer({ min: 0, max: 6 }),
      (users, threshold) => {
        const config = configWithThreshold(threshold);
        const insights = computeEngagementInsights(
          { dailyTotals: [], userMetrics: users },
          config,
        );
        const insight = insights.find((i) => i.id === DORMANT_ID)!;

        expect(insight.detail!.threshold).toBe(threshold);

        const listed = listedDormant(insight.detail!);
        const expected = expectedDormant(users, threshold);
        expect(listed).toEqual(expected);

        // No false positives / false negatives: every user is classified solely
        // by the (tier != null AND active_days <= threshold) condition, using the
        // identical threshold value.
        const dormantSet = new Set(listed);
        for (const u of users) {
          const qualifies =
            u.subscription_tier !== null && u.active_days <= threshold;
          expect(dormantSet.has(u.user_id)).toBe(qualifies);
        }
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Property 14: classification is idempotent across repeated computation ────

test("Property 14: re-running the classification on the same data yields an identical dormant set", () => {
  fc.assert(
    fc.property(
      userSets(),
      fc.integer({ min: 0, max: 6 }),
      (users, threshold) => {
        const config = configWithThreshold(threshold);
        const input = { dailyTotals: [], userMetrics: users };

        const first = computeEngagementInsights(input, config).find(
          (i) => i.id === DORMANT_ID,
        )!;
        const second = computeEngagementInsights(input, config).find(
          (i) => i.id === DORMANT_ID,
        )!;

        // Identical dormant sets (and identical reported count/threshold).
        expect(listedDormant(second.detail!)).toEqual(
          listedDormant(first.detail!),
        );
        expect(second.detail!.dormantCount).toBe(first.detail!.dormantCount);
        expect(second.detail!.threshold).toBe(first.detail!.threshold);
        expect(second.magnitude).toBe(first.magnitude);
      },
    ),
    { numRuns: RUNS },
  );
});

// ── Property 14: depends only on tier presence and the threshold ─────────────

test("Property 14: classification ignores fields other than subscription_tier and active_days", () => {
  fc.assert(
    fc.property(userSets(), (users) => {
      const config = DEFAULT_INSIGHT_CONFIG;
      const base = computeEngagementInsights(
        { dailyTotals: [], userMetrics: users },
        config,
      ).find((i) => i.id === DORMANT_ID)!;

      // Perturb only the non-classifying fields; the dormant set must not change.
      const perturbed = users.map((u) => ({
        ...u,
        total_messages: u.total_messages + 7,
        chat_conversations: u.chat_conversations + 3,
        credits_used: u.credits_used + 11,
        adoption_score: u.adoption_score + 1,
        label: `${u.label}-x`,
      }));
      const after = computeEngagementInsights(
        { dailyTotals: [], userMetrics: perturbed },
        config,
      ).find((i) => i.id === DORMANT_ID)!;

      expect(listedDormant(after.detail!)).toEqual(listedDormant(base.detail!));
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("a non-null tier at exactly the threshold is dormant; above it is not", () => {
  const users: UserMetrics[] = [
    makeUser("at", "pro", 1), // active_days == default threshold (1) -> dormant
    makeUser("above", "pro", 2), // above threshold -> not dormant
  ];
  const insight = computeEngagementInsights(
    { dailyTotals: [], userMetrics: users },
    DEFAULT_INSIGHT_CONFIG,
  ).find((i) => i.id === DORMANT_ID)!;
  expect(insight.detail!.userIds).toBe("at");
  expect(insight.detail!.dormantCount).toBe(1);
});

test("a null subscription_tier is never dormant even at zero active days", () => {
  const users: UserMetrics[] = [
    makeUser("free-user", null, 0),
    makeUser("sub-user", "team", 0),
  ];
  const insight = computeEngagementInsights(
    { dailyTotals: [], userMetrics: users },
    DEFAULT_INSIGHT_CONFIG,
  ).find((i) => i.id === DORMANT_ID)!;
  expect(insight.detail!.userIds).toBe("sub-user");
  expect(insight.detail!.dormantCount).toBe(1);
});

test("no dormant users yields count 0, magnitude 0, and no userIds field", () => {
  const users: UserMetrics[] = [
    makeUser("a", null, 0),
    makeUser("b", "pro", 5),
  ];
  const insight = computeEngagementInsights(
    { dailyTotals: [], userMetrics: users },
    DEFAULT_INSIGHT_CONFIG,
  ).find((i) => i.id === DORMANT_ID)!;
  expect(insight.detail!.dormantCount).toBe(0);
  expect(insight.magnitude).toBe(0);
  expect(insight.detail!.userIds).toBeUndefined();
});

test("a custom threshold of 0 classifies only zero-active-day subscribed users", () => {
  const users: UserMetrics[] = [
    makeUser("zero", "pro", 0),
    makeUser("one", "pro", 1),
  ];
  const insight = computeEngagementInsights(
    { dailyTotals: [], userMetrics: users },
    configWithThreshold(0),
  ).find((i) => i.id === DORMANT_ID)!;
  expect(insight.detail!.threshold).toBe(0);
  expect(insight.detail!.userIds).toBe("zero");
  expect(insight.detail!.dormantCount).toBe(1);
});
