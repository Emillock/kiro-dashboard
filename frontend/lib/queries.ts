"use client";

/**
 * TanStack Query (React Query) hooks for all backend data endpoints.
 *
 * Data is pulled from S3 once a day by the backend scheduler and stored locally, so the
 * frontend does NOT poll: refetchInterval is driven by the backend config and is disabled
 * (0) by default. Queries simply read the local snapshot on mount / range change.
 */

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";
import type { MetricKey, RangeParam, SelectionMode } from "./api";

/**
 * Fetch the backend-configured refresh interval (ms). Returns `false` when polling is
 * disabled (interval = 0), which TanStack Query treats as "no auto-refetch".
 */
export function useRefreshInterval(): number | false {
  const { data } = useQuery({
    queryKey: ["config", "refresh-interval"],
    queryFn: () => api.getRefreshInterval(),
    staleTime: 60_000,
  });
  const seconds = data?.refresh_interval_seconds ?? 0;
  return seconds > 0 ? seconds * 1000 : false;
}

/** Whether the backend has auth disabled (login not required). */
export function useAuthConfig() {
  return useQuery({
    queryKey: ["config", "auth"],
    queryFn: () => api.getAuthConfig(),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

/** Fetch the configured AI Adoption score weights (rarely change). */
export function useAdoptionWeights() {
  return useQuery({
    queryKey: ["config", "adoption-weights"],
    queryFn: () => api.getAdoptionWeights(),
    staleTime: 5 * 60_000,
  });
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
