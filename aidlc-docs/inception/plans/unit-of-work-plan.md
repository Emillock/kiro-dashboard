# Unit of Work Plan — Kiro NRT Dashboard

**Purpose**: Decompose the application into logical units of work for the Construction phase.
The application is a **monolith-per-tier** (separate backend and frontend processes, single repo),
not a microservices architecture, so units are logical dev groupings — not independently deployable
services.

Please answer the questions below, then tell me you're done.

---

## Section A — Clarifying Questions

## Question 1 — Unit decomposition granularity
How should the system be broken into units of work?

A) Two units: **Backend** (all FastAPI code) + **Frontend** (all Next.js code)
B) Three units: **Backend Core** (S3 ingestion + metrics + auth + API) + **Frontend** (Next.js)
   + **Infrastructure** (Docker Compose + config)
C) Four units: **Data & Metrics** (ingestion, parser, email-map, metrics engine, AI Adoption) +
   **Auth & API** (auth, routers, services, SQLite) + **Frontend** + **Infrastructure**
D) No preference — you choose (option C recommended: cleanest separation for Code Generation)
X) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 2 — Code repository structure
All units live in one repo. How should the top-level directories be organized?

A) `backend/` + `frontend/` + `docker-compose.yml` at root
B) `server/` + `client/` + `docker-compose.yml` at root
C) Flat root with `src/backend/` + `src/frontend/`
D) No preference — you choose (option A recommended)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3 — Build/dev sequence
In what order should units be built during the Construction phase?

A) Data & Metrics → Auth & API → Frontend → Infrastructure (data-first, unblocks API, then UI)
B) Auth & API → Data & Metrics → Frontend → Infrastructure
C) All units simultaneously (parallel development, integrate at the end)
D) No preference — you choose (option A recommended)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Section B — Execution Checklist

### Artifacts to generate
- [x] `aidlc-docs/inception/application-design/unit-of-work.md` — unit definitions + code structure
- [x] `aidlc-docs/inception/application-design/unit-of-work-dependency.md` — dependency matrix + integration points
- [x] `aidlc-docs/inception/application-design/unit-of-work-story-map.md` — story → unit assignment (all 28 stories)
- [x] Verify all stories assigned; verify dependency order matches construction sequence
