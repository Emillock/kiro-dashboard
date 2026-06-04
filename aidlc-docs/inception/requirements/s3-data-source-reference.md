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

## Full-Bucket Scan Results

A complete scan of the bucket was performed during Requirements Analysis:

- **Total CSV files**: 83
- **Total dataset size**: ~92.7 KB (the entire history is tiny — a full scan is cheap)
- **Date range**: 2026-04-09 → 2026-06-03
- **Distinct header variants**: 31 (the schema evolves frequently as models are added/removed)

## CSV Schema (stable core columns)

Confirmed columns from live samples. The first 11 columns are stable across all files; the rest
are dynamic (present in some files only).

| Column | Type | Stable? | Notes |
|---|---|---|---|
| `Date` | date (YYYY-MM-DD) | ✅ | The report day |
| `UserId` | string (UUID-like) | ✅ | Stable per-user identifier |
| `Client_Type` | enum | ✅ | `KIRO_IDE` or `KIRO_CLI` |
| `Chat_Conversations` | integer | ✅ | Number of chat conversations |
| `Credits_Used` | float | ✅ | Credits consumed |
| `Overage_Cap` | float | ✅ | Overage cap (e.g. 10000.0) |
| `Overage_Credits_Used` | float | ✅ | Overage credits used |
| `Overage_Enabled` | boolean | ✅ | `true` / `false` |
| `ProfileId` | string (ARN) | ✅ | CodeWhisperer profile ARN (same across rows in samples) |
| `Subscription_Tier` | enum | ✅ | Observed: `PRO`, `PRO_PLUS` |
| `Total_Messages` | integer | ✅ | Total messages |
| `New_User` | boolean | ⚠️ | Present in many newer files |
| `User_Email` | string (email) | ⚠️ | **Present in only 8 of 83 files** (see mapping note) |
| `auto_messages` | integer | ⚠️ | Dynamic per-mode message count |
| `claude_opus_4.5_messages` | integer | ⚠️ | Dynamic model-specific |
| `claude_opus_4.6_messages` | integer | ⚠️ | Dynamic model-specific |
| `claude_opus_4.7_messages` | integer | ⚠️ | Dynamic model-specific |
| `claude_opus_4.8_messages` | integer | ⚠️ | Dynamic model-specific |
| `claude_sonnet_4_messages` | integer | ⚠️ | Dynamic model-specific |
| `claude_sonnet_4.6_messages` | integer | ⚠️ | Dynamic model-specific |
| `claude_haiku_4.5_messages` | integer | ⚠️ | Dynamic model-specific |
| `glm_5_messages` | integer | ⚠️ | Dynamic model-specific |

**Union of all column names ever observed**: `Date, UserId, Client_Type, Chat_Conversations,
Credits_Used, Overage_Cap, Overage_Credits_Used, Overage_Enabled, ProfileId, Subscription_Tier,
Total_Messages, New_User, User_Email, auto_messages, claude_haiku_4.5_messages,
claude_opus_4.5_messages, claude_opus_4.6_messages, claude_opus_4.7_messages,
claude_opus_4.8_messages, claude_sonnet_4.6_messages, claude_sonnet_4_messages, glm_5_messages`.

Any column matching `*_messages` (or `auto_messages`) should be treated as a **model/mode message
count** and discovered dynamically.

## User_Email Mapping (CONFIRMED — answers Q10)

- `User_Email` appears in only **8 files**, all from the most recent dates (2026-05-30 → 2026-06-03),
  in both IDE and CLI variants.
- Across those files, **22 distinct UserId → email mappings** were found.
- **Every UserId maps to exactly ONE email** (0 conflicts) — the mapping is consistent.
- All emails are on the `@example.com` domain (e.g. `user11@example.com`, `user10@example.com`).

**Implication for design**: The backend must build a **UserId → email lookup** by scanning the
files that DO contain `User_Email` (across the whole bucket, not just the selected period), then
use that mapping to label users everywhere in the UI. For any `UserId` with no known email
(present in older files but never in an email-bearing file), fall back to a shortened UserId.

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

4. **User identification via email**: `UserId` is a UUID. A `User_Email` column exists in a
   subset of files and provides a consistent UserId→email mapping (see mapping section above).
   The dashboard should label users by email, falling back to a shortened UserId when unknown.

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
