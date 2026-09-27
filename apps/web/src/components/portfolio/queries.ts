'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import type { PortfolioBatchResult, PortfolioItemView, Subject } from '@/lib/types';
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

export interface BatchReviewInput {
  itemIds: string[];
  decision: 'APPROVED' | 'RETURNED';
  reason?: string | null;
}

/** Ommaviy qaror natijasi haqida xabar: nechtasi qo‘llandi, nechtasi o‘tkazib yuborildi. */
function batchMessage(result: PortfolioBatchResult) {
  const done = result.approved
    ? `${result.approved} ta yozuv tasdiqlandi.`
    : result.returned
      ? `${result.returned} ta yozuv tuzatishga qaytarildi.`
      : 'Hech bir yozuv o‘zgartirilmadi.';
  const skipped = result.skipped.length
    ? ` ${result.skipped.length} tasi o‘tkazib yuborildi — ular allaqachon ko‘rib chiqilgan, tahrirlangan yoki sizning vakolatingizdan tashqarida.`
    : '';
  return `${done}${skipped}`;
}

/**
 * Tekshiruvchi amallari: bitta yozuvni tasdiqlash va bir nechta yozuv bo‘yicha birdaniga qaror.
 * Muvaffaqiyatdan so‘ng barcha portfolio so‘rovlari (navbat, katalog, sonlar) yangilanadi.
 */
export function useReviewActions() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const approve = useMutation({
    mutationFn: (item: PortfolioItemView) =>
      api.post<PortfolioItemView>(`/portfolio/${item.id}/review`, { decision: 'APPROVED' }),
    onSuccess: (updated) => {
      queryClient.setQueryData(portfolioKeys.item(updated.id), updated);
      toast.success(`“${updated.title}” tasdiqlandi. Egasiga bildirishnoma yuborildi.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: portfolioKeys.all }),
  });

  const batch = useMutation({
    mutationFn: (input: BatchReviewInput) => api.post<PortfolioBatchResult>('/portfolio/review-batch', input),
    onSuccess: (result) => {
      if (result.approved || result.returned) toast.success(batchMessage(result));
      else toast.info(batchMessage(result));
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: portfolioKeys.all }),
  });

  return { approve, batch };
}
