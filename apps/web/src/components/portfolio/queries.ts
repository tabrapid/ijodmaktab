'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import type { PortfolioItemView, Subject } from '@/lib/types';
import { portfolioKeys, subjectsKey } from './utils';

/** Faol fanlar (forma va filtrlar uchun). */
export function useSubjects() {
  return useQuery({
    queryKey: subjectsKey,
    queryFn: () => api.get<Subject[]>('/subjects'),
    staleTime: 5 * 60_000,
  });
}

/**
 * Egasining amallari: tekshiruvga yuborish va o‘chirish. Muvaffaqiyat yoki xato haqida
 * xabar ko‘rsatiladi, portfolio so‘rovlari yangilanadi.
 */
export function usePortfolioActions() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const submit = useMutation({
    mutationFn: (id: string) => api.post<PortfolioItemView>(`/portfolio/${id}/submit`),
    onSuccess: (item) => {
      queryClient.setQueryData(portfolioKeys.item(item.id), item);
      toast.success('Yozuv tekshiruvga yuborildi. Tasdiqlovchiga bildirishnoma jo‘natildi.');
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: portfolioKeys.all }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/portfolio/${id}`),
    onSuccess: (_result, id) => {
      toast.success('Yozuv o‘chirildi.');
      // O‘chirilgan yozuvning o‘z so‘rovi qayta yuklanmaydi (sahifa yopilayotgan bo‘lishi mumkin).
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'portfolio' && !(query.queryKey[1] === 'item' && query.queryKey[2] === id),
      });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      void queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
    },
  });

  return { submit, remove };
}
