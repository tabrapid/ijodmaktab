'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, ParticipationStatus } from '@ijod/shared';
import { api, qs } from '@/lib/api';
import type { SessionDetail, SessionResults } from '@/lib/types';

export const sessionKey = (id: string) => ['session', id] as const;

export function useSession(id: string) {
  return useQuery({
    queryKey: sessionKey(id),
    queryFn: () => api.get<SessionDetail>(`/sessions/${id}`),
  });
}

export interface ResultFilterState {
  statuses: ParticipationStatus[];
  classIds: string[];
  minPercent: string;
  maxPercent: string;
  category: Category | '';
  categoryMinPercent: string;
  categoryMaxPercent: string;
  q: string;
}

export const EMPTY_RESULT_FILTERS: ResultFilterState = {
  statuses: [],
  classIds: [],
  minPercent: '',
  maxPercent: '',
  category: '',
  categoryMinPercent: '',
  categoryMaxPercent: '',
  q: '',
};

export const hasActiveFilters = (filters: ResultFilterState) =>
  filters.statuses.length > 0 ||
  filters.classIds.length > 0 ||
  Boolean(filters.minPercent || filters.maxPercent || filters.q.trim()) ||
  Boolean(filters.category && (filters.categoryMinPercent || filters.categoryMaxPercent));

const percentOrUndefined = (value: string) => {
  if (value.trim() === '') return undefined;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : undefined;
};

/** Eksport so‘rovi uchun filtrlar (natijalar jadvali bilan bir xil). */
export function exportFilters(filters: ResultFilterState) {
  const categoryMinPercent = filters.category ? percentOrUndefined(filters.categoryMinPercent) : undefined;
  const categoryMaxPercent = filters.category ? percentOrUndefined(filters.categoryMaxPercent) : undefined;
  const categoryActive = categoryMinPercent !== undefined || categoryMaxPercent !== undefined;
  return {
    statuses: filters.statuses.length ? filters.statuses : undefined,
    classIds: filters.classIds.length ? filters.classIds : undefined,
    minPercent: percentOrUndefined(filters.minPercent),
    maxPercent: percentOrUndefined(filters.maxPercent),
    category: categoryActive && filters.category ? filters.category : undefined,
    categoryMinPercent,
    categoryMaxPercent,
    q: filters.q.trim() || undefined,
  };
}

export function useSessionResults(id: string, filters: ResultFilterState = EMPTY_RESULT_FILTERS, enabled = true) {
  const params = exportFilters(filters);
  return useQuery({
    queryKey: ['session-results', id, params],
    queryFn: () => api.get<SessionResults>(`/sessions/${id}/results${qs(params)}`),
    placeholderData: (previous) => previous,
    enabled,
  });
}

/** Sessiyaga oid barcha keshlarni yangilaydi (amallardan so‘ng). */
export function useRefreshSession(id: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: sessionKey(id) }),
      queryClient.invalidateQueries({ queryKey: ['session-results', id] }),
      queryClient.invalidateQueries({ queryKey: ['session-live', id] }),
      queryClient.invalidateQueries({ queryKey: ['sessions'] }),
    ]);
}
