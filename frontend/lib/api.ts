/**
 * Typed API client for the Kiro Dashboard backend.
 * All requests attach a Bearer JWT; 401 responses clear the stored token.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types matching the backend response shapes ──────────────────────────────

export interface DailyTotal {
  date: string;
  total_messages: number;
  chat_conversations: number;
  credits_used: number;
  active_users: number;
}

export interface AggregateMetrics {
  range: string;
  start_date: string;
  end_date: string;
  total_messages: number;
  total_chat_conversations: number;
  total_credits_used: number;
  active_user_count: number;
  avg_messages_per_user: number;
  avg_conversations_per_user: number;
  model_distribution: Record<string, number>;
  daily_totals: DailyTotal[];
}

export interface UserMetrics {
  user_id: string;
  label: string;
  total_messages: number;
  chat_conversations: number;
  credits_used: number;
  active_days: number;
  model_messages: Record<string, number>;
  subscription_tier: string | null;
  adoption_score: number;
  daily_breakdown: DailyTotal[];
}

export interface UserSummary {
  user_id: string;
  label: string;
  adoption_score: number;
  total_messages: number;
  chat_conversations: number;
  credits_used: number;
  active_days: number;
}

export interface TopAdopter {
  rank: number;
  user_id: string;
  label: string;
  adoption_score: number;
}

export type RangeParam = "week" | "month";
export type MetricKey =
  | "adoption_score"
  | "total_messages"
  | "chat_conversations"
  | "credits_used"
  | "active_days";
export type SelectionMode = "top_n" | "bottom_n" | "top5_bottom5" | "all";

// ── Internal fetch wrapper ───────────────────────────────────────────────────

let _token: string | null = null;

export function setToken(token: string | null) {
  _token = token;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Token expired or invalid; clear it.
    _token = null;
    localStorage.removeItem("kiro_dashboard_token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ── Auth endpoints ───────────────────────────────────────────────────────────

export async function register(payload: {
  email: string;
  username: string;
  password: string;
}) {
  return request<{ id: number; email: string; username: string }>(
    "/api/v1/auth/register",
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export async function login(payload: { email: string; password: string }) {
  return request<{ access_token: string; token_type: string }>(
    "/api/v1/auth/login",
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export async function getMe() {
  return request<{ id: number; email: string; username: string }>(
    "/api/v1/auth/me"
  );
}

// ── Metrics endpoints ────────────────────────────────────────────────────────

export async function getAggregateMetrics(range: RangeParam = "month") {
  return request<AggregateMetrics>(`/api/v1/metrics/aggregate?range=${range}`);
}

export async function listUsers(range: RangeParam = "month", q?: string) {
  const qs = q ? `&q=${encodeURIComponent(q)}` : "";
  return request<{ range: string; users: UserSummary[] }>(
    `/api/v1/metrics/users?range=${range}${qs}`
  );
}

export async function getUserMetrics(range: RangeParam, userId: string) {
  return request<UserMetrics>(
    `/api/v1/metrics/users/${encodeURIComponent(userId)}?range=${range}`
  );
}

export async function getTopAdopters(range: RangeParam = "month", k = 5) {
  return request<{ range: string; top_adopters: TopAdopter[] }>(
    `/api/v1/metrics/top-adopters?range=${range}&k=${k}`
  );
}

export async function getComparison(
  range: RangeParam,
  metric: MetricKey,
  mode: SelectionMode,
  n?: number
) {
  const nParam = n != null ? `&n=${n}` : "";
  return request<{
    metric: string;
    mode: string;
    n: number | null;
    users: Array<{ user_id: string; label: string; value: number; adoption_score: number }>;
  }>(
    `/api/v1/metrics/compare?range=${range}&metric=${metric}&mode=${mode}${nParam}`
  );
}

export async function getRefreshInterval() {
  return request<{ refresh_interval_seconds: number }>(
    "/api/v1/config/refresh-interval"
  );
}
