# Application Design Plan — Kiro NRT Dashboard

**Role**: Software architect
**Purpose**: Identify the high-level components, their interfaces/methods, the service layer, and
component dependencies for the backend (FastAPI) and frontend (Next.js), plus the REST API contract.

This plan contains a few clarifying questions (Section A). Please fill in every `[Answer]:` tag,
then tell me you're done. I'll analyze answers for ambiguity before generating the design artifacts.

> Context already locked from earlier stages: Python/FastAPI backend, React+TS+Next.js frontend,
> Recharts, SQLite, bcrypt+JWT, on-demand S3 fetch + short-TTL cache, IDE+CLI combined per user,
> email labels from `User_Email`, configurable absolute AI-Adoption weighted sum, Docker Compose,
> PBT enabled (Hypothesis + fast-check).

---

## Section A — Clarifying Questions

## Question 1 — Backend module structure
How should the FastAPI backend be organized into components?

A) Layered by concern: `api` (routers) → `services` (orchestration) → `core` logic modules
   (`ingestion`, `metrics`, `auth`, `cache`) → `repositories` (SQLite) → `models` (schemas)
B) Feature/vertical slices: `auth/`, `metrics/`, `users/`, each containing its own router+service+logic
C) No preference — you choose (layered recommended for this size)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2 — S3 caching layer
How should the short-TTL cache for S3-derived data be implemented (single-instance app)?

A) In-process in-memory cache (TTL dict / `cachetools`) — simplest, fits single container
B) SQLite-backed cache table (survives restarts, queryable)
C) Redis (separate container) — overkill for this size but most scalable
D) No preference — you choose (in-memory recommended; email-mapping cached longer)
X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 3 — How "active days" is counted (needed for AI Adoption)
The AI Adoption score uses `Active_Days`. How should an "active day" be defined?

A) Any day with a report row for the user (presence = active)
B) Any day where the user has Total_Messages > 0 or Chat_Conversations > 0
C) No preference — you choose (option B recommended)
X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 4 — Saved dashboard layout scope
The main page blocks are reorderable/lockable and the layout persists. Persist per what?

A) Per registered user (each account has its own saved layout) — requires layout stored in SQLite keyed by user
B) Global (one shared layout for everyone)
C) Browser-local only (localStorage; not synced across devices)
D) No preference — you choose (per-user in SQLite recommended, matches FR-4.4.3)
X) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 5 — Frontend data fetching / state approach
How should the frontend fetch and cache API data and drive auto-refresh?

A) TanStack Query (React Query) with polling intervals — robust caching, refetch, loading states
B) Plain fetch + React state + setInterval
C) SWR with refresh interval
D) No preference — you choose (TanStack Query recommended)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6 — Comparison page metrics offered
Which metrics should be selectable on the comparison page? (pick the set)

A) AI Adoption, Total Messages, Chat Conversations, Credits Used, Active Days
B) Only AI Adoption and Total Messages
C) All numeric per-user metrics including each per-model message count
D) No preference — you choose (option A, plus per-model totals, recommended)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Section B — Execution Checklist (executed after plan approval)

### Design Artifacts (mandatory)
- [x] Generate `application-design/components.md` (backend + frontend components, responsibilities, interfaces)
- [x] Generate `application-design/component-methods.md` (method signatures, I/O types; business rules deferred)
- [x] Generate `application-design/services.md` (service definitions + orchestration patterns)
- [x] Generate `application-design/component-dependency.md` (dependency matrix, communication, data flow)
- [x] Generate `application-design/api-contract.md` (REST endpoints: paths, methods, request/response shapes, auth)
- [x] Generate `application-design/application-design.md` (consolidated overview)
- [x] Validate design completeness vs requirements + stories (traceability)

### Coverage
- [x] Backend components: API routers, Auth, S3 Ingestion, CSV Parser (dynamic), Email-mapping, Metrics engine, AI-Adoption calculator, Cache, Repositories, Config
- [x] Frontend components: App shell/sidebar, Auth pages, Main dashboard (blocks: drag/lock/persist, Top-5 podium, charts), Individual page (user search), Comparison page, API client, state/query layer, design tokens
- [x] REST API contract covering auth + metrics + users + layout endpoints
- [x] Apply Q1–Q6 decisions
