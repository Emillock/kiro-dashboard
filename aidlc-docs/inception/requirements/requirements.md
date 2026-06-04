# Requirements — Kiro NRT Metrics Dashboard

## 1. Intent Analysis

- **User Request**: Build, from scratch, a near-real-time (NRT) dashboard that visualizes Kiro
  usage metrics — both aggregated across all users and per individual user. Data comes from
  per-user daily CSV reports in S3. The app has a backend and a frontend, supports user
  registration/login, a main overview page with charts and modular draggable/lockable blocks
  (including Top-5 by AI Adoption with gold/silver/bronze styling), an individual-metrics page
  with a searchable user selector, and a comparison page. Styling should resemble the Kiro IDE.
- **Request Type**: New Project (greenfield), full-stack web application.
- **Scope Estimate**: System-wide (multiple components: data ingestion, metrics engine, auth,
  REST API, frontend SPA).
- **Complexity Estimate**: Complex (data aggregation over an evolving CSV schema, composite
  weighted metric, NRT refresh, rich interactive UI).

## 2. Confirmed Decisions (from clarifying questions)

| # | Decision | Choice |
|---|---|---|
| Q1 | Backend | **Python + FastAPI** (with boto3 for S3) |
| Q2 | Frontend | **React + TypeScript + Next.js** |
| Q3 | Charts | **Recharts** |
| Q4 | App data store | **SQLite** |
| Q5 | Auth | **bcrypt password hashing + JWT access tokens** |
| Q6 | Access model | **Open registration; all metrics visible to any logged-in user** (no per-user data isolation) |
| Q7 | AI Adoption inputs | **Total_Messages 40%, Chat_Conversations 30%, Credits_Used 20%, Active_Days 10%** — weights **configurable** |
| Q8 | AI Adoption scaling | **Absolute weighted sum** (raw) |
| Q9 | IDE vs CLI | **Combine IDE + CLI** into one total per user |
| Q10 | User labels | **Use `User_Email`** from the files that contain it (mapping built by scanning S3); fall back to shortened `UserId` |
| Q11 | NRT meaning | **Auto-refresh every few minutes** (re-check S3 for new/updated files) |
| Q12 | Serving strategy | **Backend fetches from S3 on demand + short-TTL cache** |
| Q13 | Default time range | **Last month** |
| Q14 | Deployment | **Docker Compose** (frontend + backend) |
| Q15 | Comparison N cap | **Cap N at 20** |
| Q16 | Security extension | **Disabled** |
| Q17 | Property-Based Testing extension | **Enabled (full enforcement)** |
| Q18 | Extra | **Frequent git commits; .gitignore excludes envs/caches/etc.** |

## 3. Data Source Summary

See `s3-data-source-reference.md` for full detail. Key points driving requirements:

- Bucket `example-kiro-activity-bucket`, prefix
  `AWSLogs/000000000000/KiroLogs/user_report/us-east-1/{year}/{month}/{day}/00/`.
- One CSV per client type (`KIRO_IDE`, `KIRO_CLI`) per day; one row per user per day.
- **Stable core columns**: `Date, UserId, Client_Type, Chat_Conversations, Credits_Used,
  Overage_Cap, Overage_Credits_Used, Overage_Enabled, ProfileId, Subscription_Tier, Total_Messages`.
- **Dynamic columns**: per-model message counts matching `*_messages` (e.g. `auto_messages`,
  `claude_opus_4.8_messages`, `glm_5_messages`) plus `New_User` and `User_Email`. The schema has
  31 distinct header variants across 83 files — the parser MUST handle columns dynamically.
- `User_Email` exists in only a subset of files but provides a **consistent** UserId→email
  mapping (22 users, 0 conflicts in current data).
- Entire dataset is small (~93 KB across 83 files), so full-bucket scans are inexpensive.

## 4. Functional Requirements

### FR-1 Authentication & Accounts
- **FR-1.1** Users can register with **email, username, and password**.
- **FR-1.2** Users can log in with **email and password**.
- **FR-1.3** Passwords are hashed with **bcrypt**; never stored or logged in plaintext.
- **FR-1.4** Successful login issues a **JWT access token**; protected API endpoints require it.
- **FR-1.5** Registration is **open**; any authenticated user can view all dashboard data
  (no per-user data partitioning).
- **FR-1.6** Basic validation: unique email, unique username, password minimum length, valid
  email format. Clear error messages on failure.
- **FR-1.7** Users can log out (client discards token; optional server-side token invalidation).

### FR-2 S3 Data Ingestion & Parsing
- **FR-2.1** The backend reads AWS credentials from `.env` (`AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`) — never hard-coded.
- **FR-2.2** The backend lists and downloads report CSVs for a requested date range from the
  documented S3 prefix, tolerating missing days/files.
- **FR-2.3** The parser handles the **evolving schema dynamically**: it always reads the stable
  core columns and discovers any `*_messages` columns at runtime as per-model message counts.
- **FR-2.4** The backend builds a **UserId → email mapping** by scanning files that contain the
  `User_Email` column (across the whole bucket). The mapping is cached and refreshed periodically.
- **FR-2.5** IDE and CLI rows for the same `UserId` are **combined** into a single per-user total.
- **FR-2.6** Fetched/parsed data is **cached with a short TTL** to keep the UI responsive; new or
  updated S3 files are picked up on cache expiry.

### FR-3 Metrics Engine
- **FR-3.1 Per-user metrics** over a selected period include at least: total messages, total chat
  conversations, total credits used, active days, per-model message breakdown, and subscription tier.
- **FR-3.2 Aggregate (all-users) metrics** include totals and averages across users (e.g. total
  messages, total conversations, total credits, active user count, model usage distribution).
- **FR-3.3 AI Adoption Score** is a **configurable weighted sum** of per-user metrics. Default
  weights: `Total_Messages 0.40`, `Chat_Conversations 0.30`, `Credits_Used 0.20`, `Active_Days 0.10`.
  - **FR-3.3.1** Weights are read from configuration (e.g. a config file / env / settings table),
    changeable without code edits.
  - **FR-3.3.2** The score is an **absolute weighted sum** (not normalized to 0–100).
- **FR-3.4** Metrics are computed for the user-selected time range (week or month on the main page).

### FR-4 Main Dashboard Page
- **FR-4.1** A time-range selector lets the user choose **last week** or **last month**; default
  is **last month**.
- **FR-4.2** Aggregate metrics are shown via **multiple Recharts charts** (e.g. messages over time,
  model usage distribution, credits over time, active users) plus summary stat cards.
- **FR-4.3** A **Top-5 by AI Adoption** block lists the five highest-scoring users. The **top 3**
  receive **gold / silver / bronze** borders respectively.
- **FR-4.4** Dashboard content is organized into **modular blocks** that the user can:
  - **FR-4.4.1** **Reorder by drag-and-drop**.
  - **FR-4.4.2** **Lock/unlock** each block via a lock icon (locked blocks cannot be dragged).
  - **FR-4.4.3** **Persist layout** (order + lock state) per user (saved to the backend / SQLite).

### FR-5 Individual Metrics Page
- **FR-5.1** Reachable from a **sidebar** navigation.
- **FR-5.2** A **user selector with search** at the top lets the user pick a Kiro user (labeled by
  email where known, else shortened UserId).
- **FR-5.3** Shows the selected user's individual metrics (per FR-3.1) with appropriate charts.

### FR-6 Comparison Page
- **FR-6.1** Reachable from the sidebar.
- **FR-6.2** The user selects **a metric** to compare across users.
- **FR-6.3** The user chooses a comparison set: **Top N**, **Last (bottom) N**, **Top-5 and
  Bottom-5 together**, or **All users**. N is capped at **20**.
- **FR-6.4** Renders a comparison **chart** (e.g. bar chart) of the chosen metric across the
  selected user set.

### FR-7 Navigation & Layout
- **FR-7.1** Persistent **sidebar** to switch between Main, Individual, and Comparison pages.
- **FR-7.2** Auth-gated routes: unauthenticated users are redirected to login.

## 5. Non-Functional Requirements

### NFR-1 Styling & UX
- **NFR-1.1** Visual design **resembles the Kiro IDE** (dark theme, Kiro-like color palette,
  typography, and accent colors). A reusable design-token set captures the palette.
- **NFR-1.2** Responsive layout for typical desktop screen sizes.
- **NFR-1.3** Accessible UI: keyboard navigation for interactive controls, sufficient color
  contrast, and ARIA labels on key elements where practical.

### NFR-2 Performance & NRT
- **NFR-2.1** Dashboard **auto-refreshes every few minutes** (configurable interval) to reflect
  new S3 data.
- **NFR-2.2** API responses for typical queries return quickly (target < 1s for cached data) via
  short-TTL caching of S3 reads.
- **NFR-2.3** Full-bucket scans (for the email mapping) are throttled/cached given the small data size.

### NFR-3 Reliability
- **NFR-3.1** Missing/partial S3 files or absent columns must not crash ingestion; the system
  degrades gracefully (skips, defaults to 0, logs a warning).
- **NFR-3.2** S3/credential errors surface as clear, non-sensitive API error messages.

### NFR-4 Maintainability & Configuration
- **NFR-4.1** AI Adoption weights and the refresh interval are configurable.
- **NFR-4.2** Secrets come only from `.env`; `.env` and caches/build artifacts are git-ignored.
- **NFR-4.3** Code is organized into clear modules (ingestion, metrics, auth, API, UI components).

### NFR-5 Deployment
- **NFR-5.1** The app runs via **Docker Compose** (frontend + backend services), with `.env`
  mounted/passed for AWS credentials.
- **NFR-5.2** Local dev workflow documented (run backend and frontend).

### NFR-6 Testing (Property-Based Testing Extension — ENABLED, full)
- **NFR-6.1** A PBT framework is selected per language: **Hypothesis** (Python backend) and
  **fast-check** (TypeScript frontend), in addition to example-based tests.
- **NFR-6.2** Pure logic with identifiable properties — metrics aggregation, AI Adoption weighted
  sum, IDE+CLI combination, dynamic CSV parsing, top/bottom-N selection — MUST have property-based
  tests (invariants, round-trips, oracle comparisons) per the PBT rules.
- **NFR-6.3** Tests support shrinking and seed-based reproducibility and run in CI.

### NFR-7 Security Baseline (Extension DISABLED)
- The optional Security Baseline extension is **disabled** per Q16. Standard secure-by-default
  practices still apply where they are part of the core request (bcrypt hashing, JWT, secrets in
  `.env`, parameterized DB access), but the extension's additional blocking rules are not enforced.

## 6. Out of Scope (current iteration)
- Per-user data access isolation / role-based authorization beyond basic auth.
- Admin UI for editing UserId→email mappings (mappings are derived from S3 automatically).
- Cloud/production deployment beyond Docker Compose (no specific cloud target requested).
- Real-time streaming/websockets (NRT is achieved via periodic polling).

## 7. Assumptions
- A-1: All dashboard users are trusted internal users (open registration, shared visibility).
- A-2: The S3 bucket remains small enough that on-demand range reads and periodic full scans for
  email mapping are inexpensive.
- A-3: `User_Email` mapping remains consistent (one email per UserId), as observed in current data.
- A-4: Display label precedence: email (if known) → shortened UserId (fallback).

## 8. Key Requirements Summary
A full-stack, dark-themed, Kiro-styled web app: FastAPI backend reads daily per-user Kiro CSV
reports from S3 (dynamic schema, IDE+CLI combined, email-labeled users), computes per-user and
aggregate metrics plus a configurable absolute weighted **AI Adoption** score, and serves a
JWT-secured REST API. A Next.js + Recharts frontend presents a main overview page (week/month
selector, charts, draggable/lockable modular blocks, Top-5 with gold/silver/bronze podium), an
individual-metrics page with searchable user selection, and a comparison page (top/last N≤20,
top-5+bottom-5, or all). NRT is achieved via periodic auto-refresh with short-TTL S3 caching.
Property-based testing is enforced; the optional security extension is disabled. Runs via Docker
Compose with frequent git commits.
