/**
 * Feature: insights-section, Property 10: New-adopter membership and ordering
 *
 * Property 10 (design.md): For all user sets, a user appears in the new-adopters
 * insight if and only if the user had zero activity in the Preceding_Sub_Period
 * and non-zero activity in the Current_Sub_Period, and the resulting list is
 * ordered by ascending user identifier.
 *
 * Validates: Requirements 4.5
 *
 * The function under test is `computeAdoptionInsights(users, config)` from
 * lib/insights/adoption.ts. The new-adopters insight has id
 * `adoption-new-adopters`:
 *   - when there are new adopters it lists them (`detail.userIds` is a
 *     comma-joined ascending list, `magnitude` = count, status "increase");
 *   - when none, it is present with count 0 / status "unchanged".
 * Adoption insights require >= 2 users (else the computer returns []).
 *
 * Uses fast-check + Vitest, minimum 100 iterations per property.
 */
import * as fc from "fast-check";
import { computeAdoptionInsights } from "../lib/insights/adoption";
import { DEFAULT_INSIGHT_CONFIG } from "../lib/insights/config";
import type { UserAdoptionInput } from "../lib/insights/types";

const RUNS = 200; // >= 100 iterations required for property tests

const NEW_ADOPTERS_ID = "adoption-new-adopters";

/**
 * Independently compute the expected new-adopter set directly from the
 * membership condition (Requirement 4.5): users with zero preceding activity
 * AND non-zero current activity, sorted ascending by `userId`. This mirrors the
 * specification rather than the implementation, so it serves as an independent
 * oracle.
 */
function expectedNewAdopters(users: UserAdoptionInput[]): string[] {
  return users
    .filter(
      (u) =>
        u.precedingScoreOrActivity === 0 && u.currentScoreOrActivity !== 0,
    )
    .map((u) => u.userId)
    .sort((a, b) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });
}

/**
 * Generate a set of >= 2 users with DISTINCT userIds and INTEGER activity
 * values that include zeros on both sides. Distinct ids are guaranteed by
 * `fc.uniqueArray` keyed on `userId`. The small activity range makes the
 * zero/non-zero boundary common on both the preceding and current sides, so the
 * membership condition is exercised densely.
 *
 * `userId` draws from a comma-free alphabet so the comma-joined
 * `detail.userIds` round-trips unambiguously through `split(",")`.
 */
const userId = (): fc.Arbitrary<string> =>
  fc.string({
    unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
    minLength: 1,
    maxLength: 6,
  });

const userSets = (): fc.Arbitrary<UserAdoptionInput[]> =>
  fc.uniqueArray(
    fc.record({
      userId: userId(),
      precedingScoreOrActivity: fc.integer({ min: 0, max: 4 }),
      currentScoreOrActivity: fc.integer({ min: 0, max: 4 }),
      adoptionScore: fc.integer({ min: 0, max: 100 }),
    }),
    { minLength: 2, maxLength: 25, selector: (u) => u.userId },
  );

/**
 * Read the listed new-adopter ids from the insight's `detail.userIds`, which is
 * the comma-joined ascending list (empty string when there are none).
 */
function listedNewAdopters(userIds: string): string[] {
  return userIds === "" ? [] : userIds.split(",");
}

// ── Property 10: membership iff condition, plus ascending ordering ───────────

test("Property 10: listed new adopters exactly equal users with zero preceding and non-zero current activity, ascending by userId", () => {
  fc.assert(
    fc.property(userSets(), (users) => {
      const insights = computeAdoptionInsights(users, DEFAULT_INSIGHT_CONFIG);
      const insight = insights.find((i) => i.id === NEW_ADOPTERS_ID);

      // The new-adopters insight is always present for >= 2 users.
      expect(insight).toBeDefined();

      const listed = listedNewAdopters(insight!.detail!.userIds as string);
      const expected = expectedNewAdopters(users);

      // Membership iff the condition holds, AND ordered ascending by userId:
      // exact array equality captures both membership and ordering at once.
      expect(listed).toEqual(expected);

      // The listed order is itself non-decreasing by userId.
      for (let i = 1; i < listed.length; i++) {
        expect(listed[i - 1] <= listed[i]).toBe(true);
      }

      // magnitude is the count of new adopters; status reflects presence.
      expect(insight!.magnitude).toBe(expected.length);
      expect(insight!.detail!.count).toBe(expected.length);
      if (expected.length > 0) {
        expect(insight!.status).toBe("increase");
      } else {
        expect(insight!.status).toBe("unchanged");
      }
    }),
    { numRuns: RUNS },
  );
});

// ── Property 10: every listed user satisfies the condition (no false positives)

test("Property 10: every listed new adopter has zero preceding and non-zero current activity", () => {
  fc.assert(
    fc.property(userSets(), (users) => {
      const insights = computeAdoptionInsights(users, DEFAULT_INSIGHT_CONFIG);
      const insight = insights.find((i) => i.id === NEW_ADOPTERS_ID);
      const listed = listedNewAdopters(insight!.detail!.userIds as string);

      const byId = new Map(users.map((u) => [u.userId, u]));
      for (const id of listed) {
        const u = byId.get(id)!;
        expect(u.precedingScoreOrActivity).toBe(0);
        expect(u.currentScoreOrActivity).not.toBe(0);
      }
    }),
    { numRuns: RUNS },
  );
});

// ── Property 10: every qualifying user is listed (no false negatives) ────────

test("Property 10: every user satisfying the condition appears in the listed new adopters", () => {
  fc.assert(
    fc.property(userSets(), (users) => {
      const insights = computeAdoptionInsights(users, DEFAULT_INSIGHT_CONFIG);
      const insight = insights.find((i) => i.id === NEW_ADOPTERS_ID);
      const listed = new Set(
        listedNewAdopters(insight!.detail!.userIds as string),
      );

      for (const u of users) {
        const qualifies =
          u.precedingScoreOrActivity === 0 && u.currentScoreOrActivity !== 0;
        if (qualifies) {
          expect(listed.has(u.userId)).toBe(true);
        }
      }
    }),
    { numRuns: RUNS },
  );
});

// ── Example-based edge cases ─────────────────────────────────────────────────

test("a single new adopter is listed with count 1 and status increase", () => {
  const users: UserAdoptionInput[] = [
    { userId: "alice", precedingScoreOrActivity: 0, currentScoreOrActivity: 3, adoptionScore: 10 },
    { userId: "bob", precedingScoreOrActivity: 2, currentScoreOrActivity: 5, adoptionScore: 20 },
  ];
  const insight = computeAdoptionInsights(users, DEFAULT_INSIGHT_CONFIG).find(
    (i) => i.id === NEW_ADOPTERS_ID,
  );
  expect(insight!.detail!.userIds).toBe("alice");
  expect(insight!.magnitude).toBe(1);
  expect(insight!.status).toBe("increase");
});

test("new adopters are ordered by ascending userId regardless of input order", () => {
  const users: UserAdoptionInput[] = [
    { userId: "zoe", precedingScoreOrActivity: 0, currentScoreOrActivity: 1, adoptionScore: 5 },
    { userId: "amy", precedingScoreOrActivity: 0, currentScoreOrActivity: 4, adoptionScore: 8 },
    { userId: "max", precedingScoreOrActivity: 0, currentScoreOrActivity: 2, adoptionScore: 6 },
  ];
  const insight = computeAdoptionInsights(users, DEFAULT_INSIGHT_CONFIG).find(
    (i) => i.id === NEW_ADOPTERS_ID,
  );
  expect(insight!.detail!.userIds).toBe("amy,max,zoe");
});

test("a user active in both periods is not a new adopter", () => {
  const users: UserAdoptionInput[] = [
    { userId: "alice", precedingScoreOrActivity: 1, currentScoreOrActivity: 3, adoptionScore: 10 },
    { userId: "bob", precedingScoreOrActivity: 2, currentScoreOrActivity: 5, adoptionScore: 20 },
  ];
  const insight = computeAdoptionInsights(users, DEFAULT_INSIGHT_CONFIG).find(
    (i) => i.id === NEW_ADOPTERS_ID,
  );
  expect(insight!.detail!.userIds).toBe("");
  expect(insight!.magnitude).toBe(0);
  expect(insight!.status).toBe("unchanged");
});

test("a user with zero current activity is never a new adopter", () => {
  const users: UserAdoptionInput[] = [
    { userId: "alice", precedingScoreOrActivity: 0, currentScoreOrActivity: 0, adoptionScore: 10 },
    { userId: "bob", precedingScoreOrActivity: 0, currentScoreOrActivity: 0, adoptionScore: 20 },
  ];
  const insight = computeAdoptionInsights(users, DEFAULT_INSIGHT_CONFIG).find(
    (i) => i.id === NEW_ADOPTERS_ID,
  );
  expect(insight!.detail!.userIds).toBe("");
  expect(insight!.status).toBe("unchanged");
});
