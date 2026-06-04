# Personas — Kiro NRT Dashboard

Three personas guide the user stories. Because the access model is open registration with shared
visibility (any logged-in user sees all data), roles are light — the personas describe **goals and
behaviors**, not access tiers.

---

## Persona 1: Maya — Metrics Viewer

- **Role**: Engineering analyst / individual contributor exploring Kiro usage.
- **Technical level**: Comfortable with dashboards and charts; not a data engineer.
- **Primary goals**:
  - Understand overall Kiro adoption across the organization at a glance.
  - Drill into a specific user's activity.
  - Customize her dashboard layout so the blocks she cares about are on top.
- **Key behaviors**:
  - Switches the main page between last week and last month.
  - Reorders and locks dashboard blocks to suit her workflow.
  - Searches for a specific user on the individual page.
- **Frustrations**:
  - Stale data; cluttered dashboards she can't rearrange.
  - Users shown as opaque UUIDs instead of recognizable names.
- **Success looks like**: A clean, Kiro-styled, auto-refreshing overview she can personalize.

---

## Persona 2: Tariel — Team Lead

- **Role**: Team lead / manager tracking adoption and comparing team members.
- **Technical level**: Business-oriented; focuses on rankings and comparisons over raw data.
- **Primary goals**:
  - See who the top adopters are (Top-5 by AI Adoption, with a clear podium).
  - Compare users on a chosen metric (top performers, laggards, or everyone).
  - Identify users who may need encouragement or support.
- **Key behaviors**:
  - Reads the Top-5 podium block on the main page.
  - Uses the comparison page to select a metric and a user set (Top N, Last N, Top-5 + Bottom-5, all).
  - Reviews per-user detail for standout or lagging individuals.
- **Frustrations**:
  - Comparisons that are unreadable when too many users are shown.
  - Inability to quickly see best/worst performers side by side.
- **Success looks like**: Fast, readable comparisons and an at-a-glance ranking of adopters.

---

## Persona 3: Orkhan — App Operator

- **Role**: Developer/operator who deploys and runs the dashboard.
- **Technical level**: High; manages credentials, configuration, and deployment.
- **Primary goals**:
  - Deploy the app reliably (Docker Compose) with AWS credentials supplied via `.env`.
  - Configure the AI Adoption weighting and the auto-refresh interval.
  - Trust that ingestion tolerates the evolving S3 schema and missing files.
- **Key behaviors**:
  - Sets environment variables and runs `docker compose up`.
  - Tunes AI Adoption weights via configuration without code changes.
  - Monitors that secrets never leak into logs or the repo.
- **Frustrations**:
  - Hard-coded config; brittle parsers that crash on new model columns.
  - Secrets accidentally committed.
- **Success looks like**: One-command deployment, configurable metrics, resilient ingestion.

---

## Persona → Focus Area Map

| Persona | Auth | Main Dashboard | Individual | Comparison | Data/Metrics | Ops/NFR |
|---|---|---|---|---|---|---|
| Maya (Metrics Viewer) | ✅ | ✅ | ✅ | ◻️ | ✅ (consumer) | ◻️ |
| Tariel (Team Lead) | ✅ | ✅ (podium) | ✅ | ✅ | ✅ (consumer) | ◻️ |
| Orkhan (App Operator) | ✅ | ◻️ | ◻️ | ◻️ | ✅ (config) | ✅ |

Legend: ✅ primary interest · ◻️ secondary/none
