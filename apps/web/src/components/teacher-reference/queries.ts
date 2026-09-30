'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, qs } from '@/lib/api';
import type { MentorshipCandidatesView, MentorshipStudentRef, TeacherReferenceView } from '@/lib/types';
import { referenceKeys } from './utils';

/** O‘qituvchining o‘z ma’lumotnomasi. */
export function useOwnReference() {
  return useQuery({
    queryKey: referenceKeys.own,
    queryFn: () => api.get<TeacherReferenceView>('/me/teacher-profile'),
  });
}

/** Rahbariyat uchun: o‘qituvchi ma’lumotnomasi (faqat ko‘rish). */
export function useTeacherReference(teacherId: string) {
  return useQuery({
    queryKey: referenceKeys.teacher(teacherId),
    queryFn: () => api.get<TeacherReferenceView>(`/teachers/${teacherId}/reference`),
    retry: false,
  });
}

/** Ustozlik uchun o‘quvchi qidirish (kamida 2 ta harf). */
export function useMentorshipStudents(q: string) {
  return useQuery({
    queryKey: referenceKeys.students(q),
    queryFn: () => api.get<MentorshipStudentRef[]>(`/me/mentorships/students${qs({ q })}`),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
}

/** Tanlangan o‘quvchining mutaxassislikka mos, tasdiqlangan sertifikatlari. */
export function useMentorshipCandidates(studentId: string | null) {
  return useQuery({
    queryKey: referenceKeys.candidates(studentId ?? ''),
    queryFn: () => api.get<MentorshipCandidatesView>(`/me/mentorships/candidates${qs({ studentId })}`),
    enabled: Boolean(studentId),
    retry: false,
  });
}

/** Ma’lumotnoma o‘zgargach: o‘z ma’lumotnomasi va ustozlik nomzodlari qayta yuklanadi. */
export function useRefreshReference() {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: referenceKeys.all }), [queryClient]);
}
