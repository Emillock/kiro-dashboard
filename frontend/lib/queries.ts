"use client";

/**
 * TanStack Query (React Query) hooks for all backend data endpoints.
 * The refetchInterval drives NRT auto-refresh (US-NRT-01).
 */

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";
import type { MetricKey, RangeParam, SelectionMode } from "./api";

// Default refresh interval in ms — overridden by backend config.
const DEFAULT_REFRESH_MS = 3 * 60 * 1000; // 3 minutes

/** Fetch the backend-configured refresh interval (once on mount). */
export function useRefreshInterval() {
  const { data } = useQuery({
    queryKey: ["config", "refresh-interval"],
    queryFn: () => api.getRefreshInterval(),
    staleTime: 60_000,
  });
  return data ? data.refresh_interval_seconds * 1000 : DEFAULT_REFRESH_MS;
}

export function useAggregateMetrics(range: RangeParam = "month") {
  const refetchInterval = useRefreshInterval();
  return useQuery({
    queryKey: ["aggregate", range],
    queryFn: () => api.getAggregateMetrics(range),
    refetchInterval,
    staleTime: 0,
  });
}

export function useUsers(range: RangeParam = "month", q?: string) {
  const refetchInterval = useRefreshInterval();
  return useQuery({
    queryKey: ["users", range, q ?? ""],
    queryFn: () => api.listUsers(range, q),
    refetchInterval,
    staleTime: 0,
  });
}

export function useUserMetrics(range: RangeParam = "month", userId: string) {
  const refetchInterval = useRefreshInterval();
  return useQuery({
    queryKey: ["user", range, userId],
    queryFn: () => api.getUserMetrics(range, userId),
    enabled: !!userId,
    refetchInterval,
    staleTime: 0,
  });
}

export function useTopAdopters(range: RangeParam = "month", k = 5) {
  const refetchInterval = useRefreshInterval();
  return useQuery({
    queryKey: ["top-adopters", range, k],
    queryFn: () => api.getTopAdopters(range, k),
    refetchInterval,
    staleTime: 0,
  });
}

export function useComparison(
  range: RangeParam,
  metric: MetricKey,
  mode: SelectionMode,
  n?: number
) {
  const refetchInterval = useRefreshInterval();
  return useQuery({
    queryKey: ["comparison", range, metric, mode, n ?? null],
    queryFn: () => api.getComparison(range, metric, mode, n),
    enabled: !!metric && !!mode,
    refetchInterval,
    staleTime: 0,
  });
}
