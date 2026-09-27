'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import type { TestDetail } from '@/lib/types';

export const testKey = (id: string) => ['test', id] as const;

export function useTest(id: string) {
  return useQuery({ queryKey: testKey(id), queryFn: () => api.get<TestDetail>(`/tests/${id}`) });
}

/**
 * Testni o‘zgartiruvchi amallar: server yangilangan testni qaytaradi, u keshga yoziladi.
 */
export function useTestMutation<TInput>(
  id: string,
  run: (input: TInput) => Promise<TestDetail>,
  successMessage?: string,
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: run,
    onSuccess: (test) => {
      queryClient.setQueryData(testKey(id), test);
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      if (successMessage) toast.success(successMessage);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export const testApi = {
  passport: (id: string) => (body: unknown) => api.put<TestDetail>(`/tests/${id}/passport`, body),
  blueprint: (id: string) => (body: unknown) => api.put<TestDetail>(`/tests/${id}/blueprint`, body),
  addQuestion: (id: string) => (body: unknown) => api.post<TestDetail>(`/tests/${id}/questions`, body),
  fromBank: (id: string) => (questionIds: string[]) =>
    api.post<TestDetail>(`/tests/${id}/questions/from-bank`, { questionIds }),
  fromTest: (id: string) => (body: { sourceTestId: string; testQuestionIds?: string[] }) =>
    api.post<TestDetail>(`/tests/${id}/questions/from-test`, body),
  updateQuestion:
    (id: string) =>
    ({ testQuestionId, ...body }: { testQuestionId: string; points?: number; content?: unknown }) =>
      api.patch<TestDetail>(`/tests/${id}/questions/${testQuestionId}`, body),
  removeQuestion: (id: string) => (testQuestionId: string) =>
    api.delete<TestDetail>(`/tests/${id}/questions/${testQuestionId}`),
  reorder: (id: string) => (testQuestionIds: string[]) =>
    api.put<TestDetail>(`/tests/${id}/questions/order`, { testQuestionIds }),
};
