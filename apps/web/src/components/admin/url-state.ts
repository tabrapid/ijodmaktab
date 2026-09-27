'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

type ParamValue = string | number | null | undefined;

/**
 * Filtrlar va sahifa raqami manzil satrida saqlanadi: sahifani yangilash yoki havolani
 * ulashish holatni yo‘qotmaydi. `useSearchParams` ishlatgani uchun komponent <Suspense> ichida bo‘lsin.
 */
export function useUrlParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const update = useCallback(
    (changes: Record<string, ParamValue>, options: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      if (options.resetPage ?? true) next.delete('page');
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );
  return { params, update };
}

/** Ruxsat etilgan qiymatlardan biri bo‘lsa qaytaradi, aks holda `undefined`. */
export function pickParam<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Musbat butun son (sahifa raqami va h.k.). */
export function intParam(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, max) : fallback;
}
