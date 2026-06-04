# S3 Data Source Reference (Kiro User Activity Reports)

This document captures the actual structure of the S3 data source, retrieved from a live
sample during Requirements Analysis. It informs the metric definitions and aggregation logic.

## Bucket & Path

- **Bucket**: `example-kiro-activity-bucket`
- **Region**: `us-east-1`
- **Prefix pattern**: `AWSLogs/000000000000/KiroLogs/user_report/us-east-1/{year}/{month}/{day}/00/`
- **File naming**:
  - `KIRO_IDE_000000000000_user_report_YYYYMMDD0000.csv`
  - `KIRO_CLI_000000000000_user_report_YYYYMMDD0000.csv`
- **Granularity**: One file per client type (IDE / CLI) per day. Each row is one user's
  aggregated stats for that day.
- **Credentials**: Read from `.env` (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`).

## CSV Schema

Confirmed columns (header order) from live samples:

| Column | Type | Notes |
|---|---|---|
| `Date` | date (YYYY-MM-DD) | The report day |
| `UserId` | string (UUID-like) | Stable per-user identifier. No human-readable name provided. |
| `Client_Type` | enum | `KIRO_IDE` or `KIRO_CLI` |
| `Chat_Conversations` | integer | Number of chat conversations |
| `Credits_Used` | float | Credits consumed |
| `Overage_Cap` | float | Overage cap (e.g. 10000.0) |
| `Overage_Credits_Used` | float | Overage credits used |
| `Overage_Enabled` | boolean | `true` / `false` |
| `ProfileId` | string (ARN) | CodeWhisperer profile ARN (same across rows in samples) |
| `Subscription_Tier` | enum | Observed: `PRO`, `PRO_PLUS` |
| `Total_Messages` | integer | Total messages |
| `auto_messages` | integer | **Dynamic column** (see note) |
| `claude_opus_4.6_messages` | integer | **Dynamic column** (model-specific) |
| `claude_sonnet_4.6_messages` | integer | **Dynamic column** (model-specific) |

## Important Observations

1. **Evolving schema / dynamic model columns**: Earlier files (e.g. 2026-04-09) contain only
   the first 11 columns. Newer files (2026-04-22 onward) add per-model message counts such as
   `auto_messages`, `claude_opus_4.6_messages`, `claude_sonnet_4.6_messages`. These model column
   names will change as new models are released. **The parser must treat model/message columns
   dynamically** rather than hard-coding them.

2. **Same user across client types**: A single `UserId` can appear in both the IDE and CLI files
   for the same day (e.g. `945884e8-...` on 2026-04-28). Aggregation must decide whether to
   combine IDE + CLI per user or keep them separate.

3. **Small daily files**: Files are small (hundreds of bytes to ~2 KB), tens of rows. The full
   dataset across many days is still modest in size — feasible to scan a date range on demand.

4. **No display names**: Only `UserId` (UUID) identifies users. The dashboard will display users
   by `UserId` unless a name-mapping is introduced.

5. **Sparse coverage**: Not every day has both IDE and CLI files; some days are missing entirely.
   Aggregation must tolerate missing days/files.

## Candidate Raw Metrics (per user, per day)

- `Chat_Conversations`
- `Credits_Used`
- `Total_Messages`
- Per-model message counts (dynamic, e.g. `auto_messages`, `claude_*_messages`)
- `Overage_Credits_Used`, `Overage_Enabled`
- `Subscription_Tier`

## Candidate Derived Metrics

- **Active days** (count of days with any activity in the period)
- **Messages per conversation** (`Total_Messages` / `Chat_Conversations`)
- **AI Adoption Score** — weighted composite of normalized metrics (weights TBD with user)
- **Model diversity** (how many distinct models used)
- Totals and averages aggregated across all users (for the main dashboard)
