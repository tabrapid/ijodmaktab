'use client';

import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '@/lib/api';
import type { AcademicYear, ClassListItem, StaffItem, Subject } from '@/lib/types';

/** Administrator bo‘limi so‘rovlari kalitlari: boshqa bo‘limlar keshiga aralashmasligi uchun “admin” bilan boshlanadi. */
export const adminKeys = {
  dashboard: ['admin', 'dashboard'] as const,
  users: ['admin', 'users'] as const,
  userList: (params: Record<string, string | number>) => ['admin', 'users', 'list', params] as const,
  user: (id: string) => ['admin', 'users', 'detail', id] as const,
  studentSearch: (q: string) => ['admin', 'users', 'student-search', q] as const,
  staffAll: ['admin', 'staff'] as const,
  staff: (q: string) => ['admin', 'staff', q] as const,
  years: ['admin', 'academic-years'] as const,
  subjectsAll: ['admin', 'subjects'] as const,
  subjects: (all: boolean) => ['admin', 'subjects', all ? 'all' : 'active'] as const,
  classes: ['admin', 'classes'] as const,
  classList: (academicYearId?: string) => ['admin', 'classes', 'list', academicYearId ?? 'current'] as const,
  classDetail: (id: string) => ['admin', 'classes', 'detail', id] as const,
  assignments: ['admin', 'teaching-assignments'] as const,
  audit: (params: Record<string, string | number>) => ['admin', 'audit', params] as const,
};

export const systemDashboardKey = ['system', 'dashboard'] as const;

/** Bir nechta so‘rovni birdaniga eskirgan deb belgilaydi (faol bo‘lganlari qayta yuklanadi). */
export function useInvalidate() {
  const queryClient = useQueryClient();
  return useCallback(
    (...keys: QueryKey[]) => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
    [queryClient],
  );
}

export function useAcademicYears() {
  return useQuery({ queryKey: adminKeys.years, queryFn: () => api.get<AcademicYear[]>('/academic-years') });
}

/** Sinflar ro‘yxati; o‘quv yili ko‘rsatilmasa — joriy o‘quv yili. */
export function useClassList(academicYearId?: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.classList(academicYearId),
    queryFn: () => api.get<ClassListItem[]>(`/classes${qs({ scope: 'all', academicYearId })}`),
    enabled,
  });
}

export function useSubjects(all: boolean) {
  return useQuery({
    queryKey: adminKeys.subjects(all),
    queryFn: () => api.get<Subject[]>(`/subjects${qs({ all: all ? 'true' : undefined })}`),
  });
}

/** Faol o‘qituvchi va rahbariyat xodimlari (ko‘pi bilan 100 ta, qidiruv bilan). */
export function useStaff(q: string) {
  return useQuery({
    queryKey: adminKeys.staff(q),
    queryFn: () => api.get<StaffItem[]>(`/users/staff${qs({ q })}`),
    staleTime: 60_000,
  });
}

/** Qiymat o‘zgarishini kechiktiradi (qidiruv maydonlari har harfda so‘rov yubormasligi uchun). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
