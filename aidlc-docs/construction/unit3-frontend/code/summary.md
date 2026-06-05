# Unit 3 — Frontend — Code Generation Summary

**Status**: Complete · **Tests**: 7 PBT+example tests passing · **Build**: ✅ `next build` passes.

## Files Created (application code under `frontend/`)

| File | Purpose | Stories |
|---|---|---|
| `next.config.ts` | NEXT_PUBLIC_API_URL env injection | — |
| `styles/theme.ts` | Kiro IDE-like design tokens (navy/violet palette, chart colors) | US-NFR-01 |
| `app/globals.css` | Global dark theme, scrollbars, form base styles | US-NFR-01 |
| `app/layout.tsx` | Root HTML layout with Providers wrapper | — |
| `app/providers.tsx` | QueryClientProvider + AuthProvider + TokenSync | — |
| `lib/auth-context.tsx` | JWT auth context (localStorage), login/logout, hydration | US-AUTH-01..04 |
| `lib/api.ts` | Typed fetch wrapper, Bearer attach, 401 redirect, all 10 endpoints | — |
| `lib/queries.ts` | TanStack Query hooks with NRT refetchInterval polling | US-NRT-01 |
| `lib/layout.ts` | localStorage block layout: load/save/reset/reorder/toggleLock | US-MAIN-06 |
| `components/layout/Sidebar.tsx` | Sidebar with 3 nav links + logout; auth guard awareness | US-NAV-01 |
| `app/(dashboard)/layout.tsx` | Dashboard layout wrapper + auth guard redirect | US-AUTH-03 |
| `app/(auth)/login/page.tsx` | Login form (email+password, error state) | US-AUTH-02 |
| `app/(auth)/register/page.tsx` | Register form (email+username+password) | US-AUTH-01 |
| `components/common/Card.tsx` | Reusable Kiro-styled card component | — |
| `components/dashboard/StatCards.tsx` | 4 summary stat cards (messages, users, convos, credits) | US-MAIN-02 |
| `components/dashboard/charts/MessagesOverTime.tsx` | Line chart: daily messages + active users | US-MAIN-02 |
| `components/dashboard/charts/ModelDistribution.tsx` | Horizontal bar chart: model usage | US-MAIN-02 |
| `components/dashboard/charts/CreditsChart.tsx` | Area chart: credits over time | US-MAIN-02 |
| `components/dashboard/charts/ActiveUsersChart.tsx` | Bar chart: active users per day | US-MAIN-02 |
| `components/dashboard/TopAdoptersPodium.tsx` | Top-5 list; gold/silver/bronze borders for ranks 1-3 | US-MAIN-03 |
| `components/dashboard/DashboardBlock.tsx` | Block wrapper with dnd-kit SortableContext, lock button | US-MAIN-04/05 |
| `components/dashboard/DashboardGrid.tsx` | DndContext + SortableContext for drag-to-reorder | US-MAIN-04 |
| `app/(dashboard)/page.tsx` | Main dashboard: time selector, 6-block grid | US-MAIN-01..06 |
| `components/individual/UserSearchSelect.tsx` | Searchable user listbox (email/userId search) | US-IND-02 |
| `app/(dashboard)/individual/page.tsx` | Individual metrics page (charts + subscription info) | US-IND-01..03 |
| `app/(dashboard)/comparison/page.tsx` | Comparison page (metric+mode+N selectors, bar chart) | US-COMP-01..03 |
| `app/page.tsx` | Root page re-export | — |
| `tests/layout.test.ts` | 7 tests: example-based + fast-check PBT (round-trip, invariants) | US-NFR-06 |
| `vitest.config.ts` | Vitest test runner config (node env, @ alias) | — |

## Key Fix Found by fast-check PBT

`lib/layout.ts` used `typeof window === "undefined"` to gate localStorage access. In the Node.js/vitest test environment `window` is undefined but `localStorage` was polyfilled as `global.localStorage`. fast-check's round-trip property immediately found this bug (counterexample: save 1-item array, loadLayout returns DEFAULT_BLOCKS). Fixed by checking `typeof localStorage === "undefined"` instead.

## PBT Compliance (Unit 3)

| Rule | Status | Notes |
|---|---|---|
| PBT-01 property identification | ✅ | Catalogue in unit plan |
| PBT-02 round-trip | ✅ | saveLayout → loadLayout round-trip |
| PBT-03 invariant | ✅ | empty storage → DEFAULT_BLOCKS; reorder preserves count |
| PBT-04 idempotency | N/A | No idempotent UI ops |
| PBT-05..06 | N/A | |
| PBT-07 generators | ✅ | `blockStateArb` strategy with constrained IDs |
| PBT-08 shrinking/seed | ✅ | fast-check default shrinking (confirmed working — found real bug) |
| PBT-09 framework | ✅ | fast-check in `package.json` |
| PBT-10 complementary | ✅ | Example-based + PBT together |

No blocking PBT findings. Bug found and fixed.

## Build Verification

- `npm run test` — 7/7 tests pass
- `npm run build` — Next.js 16 production build succeeds; TypeScript clean; 6 routes generated
