# Unit 3 — Frontend — Code Generation Plan

**Unit**: Frontend (Next.js App) · **Build order**: 3rd of 4
**Workspace root**: `c:\Users\User\Desktop\apps\repos\kiro-dashboard`
**Code location**: `frontend/` · **Doc summaries**: `aidlc-docs/construction/unit3-frontend/code/`

Single source of truth for Unit 3 Code Generation. PBT enabled (fast-check) — localStorage
layout round-trips and comparison/selection display utilities get property-based tests (PBT-10).

---

## Unit Context

**Stories implemented**: US-MAIN-01..06, US-IND-01..03, US-COMP-01..03, US-NRT-01, US-NAV-01,
US-NFR-01 (Kiro styling), US-NFR-02 (accessibility), US-AUTH-01..04 (frontend pages).

**Dependencies**: Unit 2 REST API (10 endpoints defined in `api-contract.md`).

**Key decisions locked from earlier stages**:
- React + TypeScript + Next.js 14 (App Router)
- Recharts for charts
- TanStack Query (React Query) with polling for NRT auto-refresh
- Dashboard layout persisted in **browser localStorage** (Q4=C — no backend layout endpoint)
- dnd-kit for drag-and-drop
- Kiro IDE-like dark styling (deep navy backgrounds, purple/violet accents, muted panels)

## Kiro IDE-like Design Tokens (to be implemented as `styles/theme.ts`)
- **Background deep**: `#0d1117` (body/app shell — near-black)
- **Background panel**: `#161b22` (sidebar, cards)
- **Background card**: `#1c2128` (dashboard blocks)
- **Background elevated**: `#21262d` (modals, popovers)
- **Border**: `#30363d` (dividers, card borders)
- **Text primary**: `#e6edf3` (main text — high contrast on dark)
- **Text secondary**: `#8b949e` (subtitles, captions)
- **Text muted**: `#484f58` (placeholders, disabled)
- **Accent primary**: `#7c3aed` (violet — primary buttons, active states, highlights)
- **Accent hover**: `#6d28d9`
- **Accent secondary**: `#a78bfa` (lighter violet for links, chips)
- **Success**: `#3fb950` (positive trends)
- **Warning**: `#d29922`
- **Error**: `#f85149`
- **Gold** (rank 1): `#ffd700` border
- **Silver** (rank 2): `#c0c0c0` border
- **Bronze** (rank 3): `#cd7f32` border

---

## PBT Property Catalogue (PBT-01 for Unit 3)

| Module | Property | Category |
|---|---|---|
| `lib/layout.ts` | `saveLayout` then `loadLayout` returns identical block state (round-trip) | Round-trip |
| `lib/layout.ts` | `loadLayout` on empty storage returns the default layout (invariant) | Invariant |
| comparison display (pure fn) | top-N selection always returns ≤ N items | Invariant |

**Framework**: fast-check (TypeScript). Tests live in `frontend/tests/`.

---

## Generation Steps

- [ ] **Step 1 — Project scaffold (`frontend/`)**
  - `npx create-next-app@latest frontend --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*"` (or manual equivalent).
  - Install extra deps: `recharts @tanstack/react-query @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities fast-check`.
  - Configure `next.config.js` (NEXT_PUBLIC_API_URL).

- [ ] **Step 2 — Design tokens & global styles (`styles/theme.ts`, `styles/globals.css`)**
  - Export all Kiro-like color/typography tokens as TypeScript constants.
  - Apply body background, font, and scrollbar styling globally.

- [ ] **Step 3 — Auth context & API client (`lib/auth-context.tsx`, `lib/api.ts`)**
  - JWT storage in memory + localStorage; `AuthProvider` + `useAuth` hook.
  - Typed fetch wrapper: attaches `Authorization: Bearer`, handles 401 redirect.

- [ ] **Step 4 — TanStack Query hooks (`lib/queries.ts`)**
  - `useAggregateMetrics(range)`, `useUsers(range)`, `useUserMetrics(range, userId)`,
    `useComparison(metric, mode, n, range)`, `useTopAdopters(range)`.
  - Each uses a refetch interval read from `useRefreshInterval()`.

- [ ] **Step 5 — Layout persistence (`lib/layout.ts`)**
  - `loadLayout() → BlockState[]`, `saveLayout(blocks)`, `resetLayout()`.
  - Default block order: [aggregate-charts, top-adopters, stat-cards, model-distribution].

- [ ] **Step 6 — App shell & sidebar (`components/layout/Sidebar.tsx`, `app/(dashboard)/layout.tsx`)**
  - Persistent sidebar with nav links (Main, Individual, Comparison); active highlight.
  - Auth guard: redirects to `/login` if no token.

- [ ] **Step 7 — Auth pages (`app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`)**
  - Forms with validation, call API, store token, redirect to dashboard.
  - data-testid attributes on inputs and submit buttons.

- [ ] **Step 8 — Stat cards (`components/dashboard/StatCards.tsx`)**
  - Summary cards: Total Messages, Active Users, Total Conversations, Total Credits.

- [ ] **Step 9 — Recharts chart components**
  - `components/dashboard/charts/MessagesOverTime.tsx` (line chart, daily totals)
  - `components/dashboard/charts/ModelDistribution.tsx` (pie/bar chart, model breakdown)
  - `components/dashboard/charts/CreditsChart.tsx` (area chart, credits over time)
  - `components/dashboard/charts/ActiveUsersChart.tsx` (bar chart, active users per day)
  - All Recharts responsive; use theme tokens for colors.

- [ ] **Step 10 — Top Adopters Podium (`components/dashboard/TopAdoptersPodium.tsx`)**
  - Top-5 list from `/metrics/top-adopters`; rank 1/2/3 get gold/silver/bronze CSS border.
  - Accessible: rank shown as text, not only color.

- [ ] **Step 11 — Dashboard block system (`components/dashboard/DashboardBlock.tsx`, `DashboardGrid.tsx`)**
  - `DashboardBlock`: wrapper with lock-icon button (🔒/🔓), data-testid, Kiro-styled card.
  - `DashboardGrid`: dnd-kit `SortableContext`; locked blocks are draggable=false.
  - On reorder or lock-toggle: call `saveLayout`.

- [ ] **Step 12 — Main dashboard page (`app/(dashboard)/page.tsx`)**
  - TimeRangeSelector (week/month, default month).
  - Renders DashboardGrid with 4 blocks: StatCards, MessagesOverTime + CreditsChart, ModelDistribution, TopAdoptersPodium.
  - Hydrates from localStorage on mount via `loadLayout`.

- [ ] **Step 13 — Individual page (`app/(dashboard)/individual/page.tsx`, `UserSearchSelect.tsx`, `UserMetricCharts.tsx`)**
  - Searchable user selector using `useUsers`; per-user charts using `useUserMetrics`.

- [ ] **Step 14 — Comparison page (`app/(dashboard)/comparison/page.tsx`, `MetricSelect.tsx`, `UserSetSelect.tsx`, `ComparisonChart.tsx`)**
  - Metric selector (5 options, Q6=A).
  - Mode selector: Top N / Bottom N / Top-5+Bottom-5 / All; N input capped at 20.
  - Bar chart comparing selected users.

- [ ] **Step 15 — PBT tests (`frontend/tests/`)**
  - `layout.test.ts`: fast-check round-trip + default-layout invariant.
  - `comparison.test.ts`: top-N size invariant using fast-check.

- [ ] **Step 16 — Documentation summary**
  - `aidlc-docs/construction/unit3-frontend/code/summary.md`.

- [ ] **Step 17 — Verify** — `npm run build` passes (no type errors); tests pass.

---

## PBT Compliance (to confirm at completion)

| Rule | Applies | Plan coverage |
|---|---|---|
| PBT-01 property identification | Yes | Catalogue above |
| PBT-02 round-trip | Yes | layout save/load round-trip (Step 15) |
| PBT-03 invariant | Yes | default layout, top-N size cap |
| PBT-04 idempotency | N/A | no idempotent ops in UI layer |
| PBT-05 oracle | N/A | |
| PBT-06 stateful | N/A | |
| PBT-07 generators | Yes | fast-check strategies for BlockState arrays |
| PBT-08 shrinking/seed | Yes | fast-check default shrinking |
| PBT-09 framework | Yes | fast-check in package.json |
| PBT-10 complementary | Yes | example + PBT tests |

## Story Traceability

| Story | Steps |
|---|---|
| US-AUTH-01..04 | 3, 7 |
| US-MAIN-01 | 12 (TimeRangeSelector) |
| US-MAIN-02 | 8, 9, 12 |
| US-MAIN-03 | 10, 12 |
| US-MAIN-04 | 11, 12 |
| US-MAIN-05 | 11, 12 |
| US-MAIN-06 | 5, 12 |
| US-IND-01 | 6 |
| US-IND-02 | 13 |
| US-IND-03 | 13 |
| US-COMP-01 | 6, 14 |
| US-COMP-02 | 14 |
| US-COMP-03 | 14 |
| US-NRT-01 | 4 (refetchInterval) |
| US-NAV-01 | 6 |
| US-NFR-01 | 2 (theme tokens) |
| US-NFR-02 | all steps (data-testid, ARIA, contrast) |

**Total steps**: 17.
