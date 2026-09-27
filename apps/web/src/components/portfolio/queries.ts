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
  /** Tekshiruvchi ko‘rgan versiyalar (yozuv ID → updatedAt): keyin o‘zgartirilganlari qo‘llanmaydi. */
  versions?: Record<string, string>;
}

/** Ommaviy qaror so‘rovi ekranda ko‘rsatilgan yozuvlar versiyalari bilan. */
export function batchReviewInput(
  items: readonly PortfolioItemView[],
  decision: BatchReviewInput['decision'],
  reason?: string | null,
): BatchReviewInput {
  return {
    itemIds: items.map((item) => item.id),
    decision,
    reason,
    versions: Object.fromEntries(items.map((item) => [item.id, item.updatedAt])),
  };
}

/** Ko‘rilgandan keyin o‘zgartirilgani uchun qo‘llanmagan (navbatda qolgan) yozuvlar. */
export const changedSinceView = (result: PortfolioBatchResult) =>
  new Set(result.skipped.filter((entry) => entry.reason === 'CHANGED').map((entry) => entry.id));

/** Ommaviy qaror natijasi haqida xabar: nechtasi qo‘llandi, nechtasi o‘tkazib yuborildi. */
function batchMessage(result: PortfolioBatchResult) {
  const done = result.approved
    ? `${result.approved} ta yozuv tasdiqlandi.`
    : result.returned
      ? `${result.returned} ta yozuv tuzatishga qaytarildi.`
      : 'Hech bir yozuv o‘zgartirilmadi.';
  const changed = changedSinceView(result).size;
  const other = result.skipped.length - changed;
  return [
    done,
    changed ? `${changed} tasi siz ko‘rganingizdan keyin o‘zgartirilgan — yangi holatini ko‘rib chiqing.` : null,
    other
      ? `${other} tasi o‘tkazib yuborildi — ular allaqachon ko‘rib chiqilgan, tahrirlangan yoki sizning vakolatingizdan tashqarida.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Tekshiruvchi amallari: bitta yozuvni tasdiqlash va bir nechta yozuv bo‘yicha birdaniga qaror.
 * Muvaffaqiyatdan so‘ng barcha portfolio so‘rovlari (navbat, katalog, sonlar) yangilanadi.
 */
export function useReviewActions() {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Ko‘rsatilgan versiya yuboriladi: egasi shu orada tahrirlab qayta yuborgan bo‘lsa, server 409 qaytaradi.
  const approve = useMutation({
    mutationFn: (item: PortfolioItemView) =>
      api.post<PortfolioItemView>(`/portfolio/${item.id}/review`, {
        decision: 'APPROVED',
        updatedAt: item.updatedAt,
      }),
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
      if (changedSinceView(result).size) toast.info(batchMessage(result));
      else if (result.approved || result.returned) toast.success(batchMessage(result));
      else toast.info(batchMessage(result));
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: portfolioKeys.all }),
  });

  return { approve, batch };
}
