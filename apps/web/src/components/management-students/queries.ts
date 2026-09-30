'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { adminKeys } from '@/components/admin/queries';
import { api } from '@/lib/api';
import { ME_KEY } from '@/lib/auth';
import type { ManagementClassCard } from '@/lib/types';

/** “O‘quvchilar” bo‘limi so‘rovlari kalitlari: barchasi ['management-students', ...] bilan boshlanadi. */
export const managementKeys = {
  all: ['management-students'] as const,
  students: (params: object) => ['management-students', 'students', params] as const,
  student: (id: string) => ['management-students', 'student', id] as const,
  classes: ['management-students', 'classes'] as const,
  classDetail: (id: string) => ['management-students', 'class', id] as const,
};

/** O‘quvchining natijalar tarixi (o‘qituvchi sahifasi bilan umumiy kesh). */
export const studentResultsKey = (id: string) => ['student-results', id] as const;

/** Joriy o‘quv yili sinflari (kartalar, filtrlar va sinf rahbari ogohlantirishi uchun). */
export function useManagementClasses() {
  return useQuery({
    queryKey: managementKeys.classes,
    queryFn: () => api.get<ManagementClassCard[]>('/management/classes'),
  });
}

/**
 * O‘quvchi, sinf yoki sinf rahbari o‘zgargach: bo‘lim so‘rovlari hamda boshqa bo‘limlardagi bog‘liq
 * ro‘yxatlar (foydalanuvchilar, sinflar, o‘qituvchining sinf sahifasi, joriy foydalanuvchi) yangilanadi.
 */
export function useRefreshStudents() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all(
        [managementKeys.all, adminKeys.users, adminKeys.classes, ['class'], ME_KEY].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
    [queryClient],
  );
}
