# Component Dependencies — Kiro NRT Dashboard

---

## Backend Dependency Matrix

Rows = component that depends on; Columns = component depended upon. ✅ = direct dependency.

|  | BE-1 Config | BE-2 Auth | BE-3 S3Client | BE-4 Parser | BE-5 EmailMap | BE-6 Metrics | BE-7 Adoption | BE-8 Ranking | BE-9 Cache | BE-10 Repos |
|---|---|---|---|---|---|---|---|---|---|---|
| **BE-2 Auth** | ✅ | | | | | | | | | ✅ |
| **BE-3 S3Client** | ✅ | | | | | | | | | |
| **BE-4 Parser** | | | | | | | | | | |
| **BE-5 EmailMap** | ✅ | | ✅ | ✅ | | | | | ✅ | |
| **BE-6 Metrics** | | | | ✅ | ✅ | | | | | |
| **BE-7 Adoption** | ✅ | | | | | ✅ | | | | |
| **BE-8 Ranking** | | | | | | ✅ | ✅ | | | |
| **BE-9 Cache** | ✅ | | | | | | | | | ✅ |
| **AuthService** | ✅ | ✅ | | | | | | | | ✅ |
| **MetricsService** | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| **UserDirService** | | | | | | | | | | |
| **UserDirService** (reuse) | | | | | | | | | | |
| **API Routers** | | ✅ (dep) | | | | | | | | |

**Key communication patterns**:
- All routers use `get_current_user` (BE-2 FastAPI dependency) for auth enforcement.
- `MetricsService` is the single orchestrator — routers never call core components directly.
- `Cache` (BE-9) wraps SQLite via `CacheRepository` (BE-10); all other components use the cache only through MetricsService or EmailMapping.

---

## Frontend Dependency Graph

```
App (Next.js root)
├── FE-8 Theme / Design Tokens (global, consumed everywhere)
├── FE-2 Auth Pages
│   └── FE-3 API Client
├── FE-1 App Shell / Sidebar (layout wrapper — wraps all pages below)
│   ├── FE-5 Main Dashboard
│   │   ├── FE-4 Query Hooks (useAggregateMetrics, useUsers/top-adopters)
│   │   ├── FE-9 Layout Persistence (localStorage)
│   │   └── FE-3 API Client (via hooks)
│   ├── FE-6 Individual Page
│   │   ├── FE-4 Query Hooks (useUsers, useUserMetrics)
│   │   └── FE-3 API Client
│   └── FE-7 Comparison Page
│       ├── FE-4 Query Hooks (useComparison)
│       └── FE-3 API Client
```

---

## Cross-Boundary Data Flow

```
Browser (FE)                          Backend (BE)              AWS S3
-----------                           ------------              ------

[Auth Page] --POST /auth/login------> AuthService
            <---JWT token-----------  └─ UserRepository (SQLite)

[TanStack Query polling]
[Main Dashboard]
  --GET /metrics/aggregate?range=--> MetricsService
                                       ├─ CacheRepository (check)
                                       │    HIT → return cached JSON
                                       │    MISS:
                                       │      S3Client ---------> list+fetch CSVs
                                       │      CSV Parser <-------- raw bytes
                                       │      EmailMap (cache check/scan)
                                       │      Metrics Engine
                                       │      AI Adoption Calculator
                                       │      CacheRepository (store)
            <--- AggregateMetrics ----  └─ return

[Individual Page]
  --GET /metrics/users?range=-------> MetricsService (cached)
  --GET /metrics/user/{id}?range=--> MetricsService (slice from cache)

[Comparison Page]
  --GET /metrics/compare?..-------->  MetricsService → Ranking/Selection

Layout state:
  FE-9 (localStorage) ← no API call; browser-local only (Q4=C)
```

---

## Deployment Topology (Docker Compose)

```
┌────────────────────────────────┐
│  docker-compose                │
│  ┌──────────────────────────┐  │
│  │  frontend  (Next.js)     │  │   port 3000
│  │  Node container          │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │  backend   (FastAPI)     │  │   port 8000
│  │  Python container        │  │
│  │  + SQLite file (volume)  │  │
│  └──────────────────────────┘  │
│  .env mounted as env vars      │
└────────────────────────────────┘
              │
              │ HTTPS (boto3)
              ▼
         AWS S3 bucket
```

Frontend calls backend via `NEXT_PUBLIC_API_URL` (env var, e.g. `http://localhost:8000`).
Backend reads AWS credentials from environment. SQLite DB file on a named Docker volume.
