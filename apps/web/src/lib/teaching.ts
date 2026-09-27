'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { hasRole, useMe } from './auth';
import type { Subject, TeachingAssignmentItem } from './types';

/**
 * Foydalanuvchi test tuza oladigan fanlar: o‘qituvchi — o‘zi dars beradigan fanlar,
 * rahbariyat — barcha faol fanlar.
 */
export function useMySubjects() {
  const { data: me } = useMe();
  const leadership = hasRole(me, 'DEPUTY', 'SUPER_ADMIN');
  return useQuery({
    queryKey: ['my-subjects', leadership],
    enabled: Boolean(me),
    queryFn: async () => {
      if (leadership) return api.get<Subject[]>('/subjects');
      const assignments = await api.get<TeachingAssignmentItem[]>('/me/teaching');
      const unique = new Map(assignments.map((item) => [item.subject.id, item.subject]));
      return [...unique.values()]
        .map((subject) => ({ ...subject, shortName: null, isActive: true }))
        .sort((a, b) => a.name.localeCompare(b.name, 'uz'));
    },
    staleTime: 5 * 60_000,
  });
}

export const GRADE_LEVELS = Array.from({ length: 11 }, (_, index) => index + 1);
