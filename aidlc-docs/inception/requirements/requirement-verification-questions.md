# Requirements Verification Questions — Kiro NRT Dashboard

Please answer each question by filling in the letter choice (or text) after the `[Answer]:` tag.
If none of the options match, choose the **Other** option and describe your preference after the tag.
When you're done, let me know (say "done" / "finished") and I'll analyze the answers.

I've already retrieved a live sample from the S3 bucket, so the questions below are informed by
the **actual** data structure (see `s3-data-source-reference.md`). The CSV columns are:
`Date, UserId, Client_Type, Chat_Conversations, Credits_Used, Overage_Cap, Overage_Credits_Used,
Overage_Enabled, ProfileId, Subscription_Tier, Total_Messages`, plus dynamic per-model message
columns (e.g. `auto_messages`, `claude_opus_4.6_messages`, `claude_sonnet_4.6_messages`).

---

## Section A — Technology Stack

## Question 1
What backend technology stack do you prefer?

A) Python (FastAPI) — pairs naturally with boto3 for S3, good for data aggregation
B) Node.js (Express/NestJS + TypeScript) — single language across front and back end
C) Python (Flask)
D) No strong preference — you (Kiro) choose the best fit
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2
What frontend technology stack do you prefer?

A) React + TypeScript + Vite
B) React + TypeScript + Next.js
C) Vue 3 + TypeScript
D) No strong preference — you (Kiro) choose the best fit
X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 3
Which charting library should the dashboard use?

A) Recharts (React-friendly, simple)
B) ECharts (very feature-rich, great for comparisons)
C) Chart.js
D) No preference — you choose
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Section B — Data Storage & Authentication

## Question 4
Where should application data (registered users, saved dashboard layouts) be stored?

A) PostgreSQL
B) SQLite (simplest, file-based, good for a single-instance internal tool)
C) MongoDB
D) No preference — you choose
X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 5
How should user passwords / sessions be handled?

A) Hashed passwords (bcrypt) + JWT access tokens
B) Hashed passwords (bcrypt) + server-side sessions (cookies)
C) No preference — you choose a secure standard approach
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6
Should dashboard access be restricted (only registered/approved users can view metrics), or is registration open to anyone?

A) Open registration — anyone can register and immediately view the dashboard
B) Open registration, but all data is visible to any logged-in user (no per-user data isolation)
C) Restricted — new registrations require admin approval before access
X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Section C — Metrics & AI Adoption Score

## Question 7
The "AI Adoption" metric is a weighted composite. Which raw metrics should feed into it, and with what relative weights? (Pick a starting point; exact weights can be tuned later.)

A) Total_Messages (40%), Chat_Conversations (30%), Credits_Used (20%), Active_Days (10%)
B) Total_Messages (30%), Chat_Conversations (20%), Active_Days (20%), Model_Diversity (15%), Credits_Used (15%)
C) Equal weights across: Total_Messages, Chat_Conversations, Credits_Used, Active_Days
D) No preference — you propose a sensible weighting and make it configurable
X) Other (please describe after [Answer]: tag below — list metrics and weights)

[Answer]: Option A and make it configurable

## Question 8
Should the AI Adoption score be normalized (e.g., 0–100 scale relative to the most active user), or an absolute weighted sum?

A) Normalized 0–100 relative to the top performer in the selected period
B) Absolute weighted sum (raw)
C) No preference — you choose (normalized recommended for fair comparison)
X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 9
A single UserId can appear in BOTH the IDE and CLI daily reports. How should per-user metrics treat the two client types?

A) Combine IDE + CLI into one total per user
B) Keep IDE and CLI separate (treat as distinct rows/series)
C) Combine by default, but allow filtering by client type in the UI
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 10
The data only contains `UserId` (a UUID) — there are no human-readable names. How should users be labeled in the UI?

A) Show the raw UserId (UUID)
B) Show a shortened UserId (e.g., first 8 chars) with full ID on hover
C) Allow an admin to map UserIds to display names (extra feature)
X) Other (please describe after [Answer]: tag below)

[Answer]: Some of the files in S3 bucket provide the column called User_Email, whcih should be used instead of userId. Find the mappings from that files. This column appears not in all files for some reason so search for them.

---

## Section D — Near-Real-Time Behavior & Performance

## Question 11
The data updates daily (one file per day). What does "near real-time" mean for this dashboard?

A) Auto-refresh the dashboard every few minutes by re-checking S3 for new/updated files
B) Refresh on page load + a manual "Refresh" button
C) Background sync on a schedule (e.g., hourly) into the local DB, UI reads from DB
D) No preference — you choose a sensible approach
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 12
How should S3 data be served to the frontend to keep it responsive?

A) Backend fetches from S3 on demand and caches results in memory/DB for a short TTL
B) Backend periodically ingests S3 files into the local database; API serves from DB
C) No preference — you choose (option A or B as appropriate)
X) Other (please describe after [Answer]: tag below)

[Answer]: 

## Question 13
For the "last week / last month" time range selector on the main page, what should the default be?

A) Last week
B) Last month
C) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Section E — Deployment & Scope

## Question 14
How will this application be run/deployed?

A) Local development only (run on your machine) for now
B) Docker Compose (containerized front + back + db) for easy local/server deployment
C) Cloud deployment (AWS) — please specify in Other
D) No preference — you choose (Docker Compose recommended)
X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 15
The comparison page lets users pick "top N", "last N", "top-5 and bottom-5", or "all users". Is there a reasonable upper bound on N (to keep charts readable), or should it be unbounded?

A) Cap N at 20
B) Cap N at 50
C) Unbounded (show whatever the user picks)
D) No preference — you choose a sensible cap
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Section F — Extensions (Project Standards)

## Question 16: Security Extensions
Should security extension rules be enforced for this project?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications)
B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)
X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 17: Property-Based Testing Extension
Should property-based testing (PBT) rules be enforced for this project?

A) Yes — enforce all PBT rules as blocking constraints (recommended for projects with business logic, data transformations, serialization, or stateful components)
B) Partial — enforce PBT rules only for pure functions and serialization round-trips (suitable for projects with limited algorithmic complexity)
C) No — skip all PBT rules (suitable for simple CRUD applications, UI-only projects, or thin integration layers with no significant business logic)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 18 — Anything else?
Any additional requirements, constraints, or preferences not covered above (e.g., specific Kiro IDE color palette, dark/light mode, accessibility needs, specific charts you want on the main page)?

[Answer]: Frequently commit changes to git and update .gitignore to not include envs, caches etc. to repo
