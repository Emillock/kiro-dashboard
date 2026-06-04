# Unit of Work — Story Map — Kiro NRT Dashboard

Maps all 28 user stories to their primary unit. A story may span two units (e.g., an API endpoint
in Unit 2 and a frontend page in Unit 3); in that case both units are listed with the primary unit
bolded.

| Story ID | Title | Primary Unit | Also involves |
|---|---|---|---|
| **Unit 1 — Data & Metrics** | | | |
| US-DATA-02 | Fetch reports for a date range | **Unit 1** | — |
| US-DATA-03 | Parse evolving CSV schema dynamically | **Unit 1** | — |
| US-DATA-04 | Combine IDE and CLI per user | **Unit 1** | — |
| US-DATA-05 | Map UserId to email | **Unit 1** | — |
| US-METRIC-01 | Compute per-user metrics | **Unit 1** | Unit 2 (API) |
| US-METRIC-02 | Compute aggregate metrics | **Unit 1** | Unit 2 (API) |
| US-METRIC-03 | Configurable AI Adoption weighted score | **Unit 1** | Unit 2 (config API) |
| US-NFR-06 | Property-based test coverage of core logic | **Unit 1** | Unit 3 (frontend PBT) |
| **Unit 2 — Auth & API** | | | |
| US-AUTH-01 | Register an account | **Unit 2** | Unit 3 (register page) |
| US-AUTH-02 | Log in | **Unit 2** | Unit 3 (login page) |
| US-AUTH-03 | Access control on protected routes | **Unit 2** | Unit 3 (AuthGuard) |
| US-AUTH-04 | Log out | **Unit 2** | Unit 3 (logout action) |
| US-DATA-01 | Read AWS credentials from environment | **Unit 2** | Unit 1 (Config) |
| US-NFR-05 | Resilient ingestion | **Unit 2** | Unit 1 (parser errors) |
| **Unit 3 — Frontend** | | | |
| US-MAIN-01 | Switch time range (week/month) | **Unit 3** | Unit 2 (query param) |
| US-MAIN-02 | View aggregate charts and summary cards | **Unit 3** | Unit 2 (aggregate API) |
| US-MAIN-03 | Top-5 by AI Adoption with podium styling | **Unit 3** | Unit 2 (top-adopters API) |
| US-MAIN-04 | Reorder dashboard blocks by drag-and-drop | **Unit 3** | — |
| US-MAIN-05 | Lock/unlock a block | **Unit 3** | — |
| US-MAIN-06 | Persist dashboard layout | **Unit 3** | — (localStorage) |
| US-IND-01 | Navigate to the individual page via sidebar | **Unit 3** | — |
| US-IND-02 | Select a user with search | **Unit 3** | Unit 2 (users list API) |
| US-IND-03 | View individual user metrics and charts | **Unit 3** | Unit 2 (user detail API) |
| US-COMP-01 | Navigate to comparison page, pick a metric | **Unit 3** | — |
| US-COMP-02 | Select the comparison user set | **Unit 3** | Unit 2 (compare API) |
| US-COMP-03 | View the comparison chart | **Unit 3** | Unit 2 (compare API) |
| US-NAV-01 | Persistent sidebar navigation | **Unit 3** | — |
| US-NRT-01 | Auto-refresh dashboard data | **Unit 3** | Unit 2 (cache TTL) |
| US-NFR-01 | Kiro IDE-like styling | **Unit 3** | — |
| US-NFR-02 | Accessible UI | **Unit 3** | — |
| **Unit 4 — Infrastructure** | | | |
| US-NFR-03 | Deploy via Docker Compose | **Unit 4** | Units 1–3 |
| US-NFR-04 | Configurable refresh interval and weights | **Unit 4** | Unit 1 (weights), Unit 2 (API) |

---

## Coverage Check

- **Total stories**: 28 (from stories.md: US-AUTH-01..04, US-DATA-01..05, US-METRIC-01..03,
  US-MAIN-01..06, US-IND-01..03, US-COMP-01..03, US-NRT-01, US-NAV-01, US-NFR-01..06)
- **Stories assigned**: 32 entries (some stories span 2 units and appear in both).
- **Unassigned stories**: 0 ✅

### Count per unit
| Unit | Primary stories | Also-involves |
|---|---|---|
| Unit 1 — Data & Metrics | 8 | — |
| Unit 2 — Auth & API | 6 | 8 (shared with Unit 1/3) |
| Unit 3 — Frontend | 16 | 7 (shared with Unit 2) |
| Unit 4 — Infrastructure | 2 | 3 (wraps all units) |

---

## Construction Sequence (per execution plan)

```
Unit 1 Code Generation  ──►  Unit 2 Code Generation  ──►  Unit 3 Code Generation  ──►  Unit 4 Code Generation
(Data & Metrics)              (Auth & API)                  (Frontend)                   (Infrastructure)
     │                              │                             │                            │
     └── Core logic + PBT          └── REST API + auth           └── UI + PBT               └── Docker Compose
         complete before Unit 2        complete before Unit 3         complete before Unit 4       integration test
```
