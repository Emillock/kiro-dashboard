# REST API Contract — Kiro NRT Dashboard

Base URL: `http://localhost:8000` (dev) · Versioning: `/api/v1` prefix.

All endpoints except `/api/v1/auth/*` and `/api/v1/health` require:
```
Authorization: Bearer <JWT>
```

Dates in responses: ISO-8601 strings. Errors follow:
```json
{ "detail": "<message>" }
```

---

## Auth

### POST /api/v1/auth/register
Register a new account.

**Request body**:
```json
{
  "email": "user20@example.com",
  "username": "user1",
  "password": "Str0ngPass!"
}
```

**Response 201**:
```json
{
  "id": 1,
  "email": "user20@example.com",
  "username": "user1"
}
```

**Errors**: `422` validation failure · `409` email or username already in use.

---

### POST /api/v1/auth/login
Login and receive a JWT.

**Request body**:
```json
{ "email": "user20@example.com", "password": "Str0ngPass!" }
```

**Response 200**:
```json
{ "access_token": "<jwt>", "token_type": "bearer" }
```

**Errors**: `401` invalid credentials · `422` validation failure.

---

### GET /api/v1/auth/me
Returns the currently authenticated user.

**Response 200**:
```json
{ "id": 1, "email": "user20@example.com", "username": "user1" }
```

---

## Metrics

### GET /api/v1/metrics/aggregate
Aggregate metrics for all users over a time range.

**Query params**:
| Param | Type | Default | Description |
|---|---|---|---|
| `range` | `"week"` \| `"month"` | `"month"` | Reporting window |

**Response 200**:
```json
{
  "range": "month",
  "start_date": "2026-05-04",
  "end_date": "2026-06-03",
  "total_messages": 12400,
  "total_chat_conversations": 830,
  "total_credits_used": 4120.5,
  "active_user_count": 18,
  "avg_messages_per_user": 688.9,
  "avg_conversations_per_user": 46.1,
  "model_distribution": {
    "auto_messages": 4200,
    "claude_opus_4.8_messages": 7100,
    "claude_sonnet_4.6_messages": 1100
  },
  "daily_totals": [
    { "date": "2026-05-04", "total_messages": 420, "active_users": 12 }
  ]
}
```

---

### GET /api/v1/metrics/users
List all Kiro users with summary metrics (used by the Individual page search selector).

**Query params**: `range` (same as above).

**Response 200**:
```json
{
  "range": "month",
  "users": [
    {
      "user_id": "3418e4b8-...",
      "label": "user11@example.com",
      "adoption_score": 312.4,
      "total_messages": 720,
      "chat_conversations": 45,
      "credits_used": 180.2,
      "active_days": 18
    }
  ]
}
```

---

### GET /api/v1/metrics/users/{user_id}
Full metrics for one Kiro user.

**Query params**: `range`.

**Response 200**:
```json
{
  "user_id": "3418e4b8-...",
  "label": "user11@example.com",
  "range": "month",
  "start_date": "2026-05-04",
  "end_date": "2026-06-03",
  "total_messages": 720,
  "chat_conversations": 45,
  "credits_used": 180.2,
  "active_days": 18,
  "adoption_score": 312.4,
  "subscription_tier": "PRO_PLUS",
  "model_messages": {
    "auto_messages": 300,
    "claude_opus_4.8_messages": 420
  },
  "daily_breakdown": [
    { "date": "2026-05-04", "total_messages": 32, "chat_conversations": 2 }
  ]
}
```

**Errors**: `404` user not found in period.

---

### GET /api/v1/metrics/top-adopters
Top-K users by AI Adoption score for the main-page podium.

**Query params**: `range` · `k` (default 5, max 5).

**Response 200**:
```json
{
  "range": "month",
  "top_adopters": [
    { "rank": 1, "user_id": "...", "label": "user10@example.com", "adoption_score": 520.1 },
    { "rank": 2, "user_id": "...", "label": "user4@example.com", "adoption_score": 490.3 },
    { "rank": 3, "user_id": "...", "label": "user11@example.com", "adoption_score": 312.4 },
    { "rank": 4, "user_id": "...", "label": "user15@example.com", "adoption_score": 280.0 },
    { "rank": 5, "user_id": "...", "label": "user12@example.com", "adoption_score": 201.6 }
  ]
}
```

---

### GET /api/v1/metrics/compare
Comparison set for the comparison page.

**Query params**:
| Param | Type | Required | Description |
|---|---|---|---|
| `range` | `"week"` \| `"month"` | No (default month) | Time window |
| `metric` | `"adoption_score"` \| `"total_messages"` \| `"chat_conversations"` \| `"credits_used"` \| `"active_days"` | Yes | Metric to rank by |
| `mode` | `"top_n"` \| `"bottom_n"` \| `"top5_bottom5"` \| `"all"` | Yes | Selection mode |
| `n` | integer 1–20 | Only for `top_n`/`bottom_n` | User count |

**Response 200**:
```json
{
  "metric": "total_messages",
  "mode": "top_n",
  "n": 10,
  "users": [
    { "user_id": "...", "label": "user10@example.com", "value": 720, "adoption_score": 520.1 }
  ]
}
```

**Errors**: `422` invalid metric/mode/n.

---

## Health

### GET /api/v1/health
No auth required.

**Response 200**:
```json
{ "status": "ok", "version": "1.0.0" }
```

---

## Frontend Config Endpoint

### GET /api/v1/config/refresh-interval
Returns the configured polling interval so the frontend doesn't need to hard-code it.

**Response 200**:
```json
{ "refresh_interval_seconds": 180 }
```
