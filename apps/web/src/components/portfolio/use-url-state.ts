'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Filtrlar URL so‘rov satrida saqlanadi: sahifani yangilash yoki “Orqaga” qaytishda holat
 * yo‘qolmaydi. `defaults` modul darajasidagi o‘zgarmas obyekt bo‘lishi kerak; standart
 * qiymatlar URLga yozilmaydi. Komponent <Suspense> ichida ishlatilishi shart.
 */
export function useUrlState<K extends string>(defaults: Readonly<Record<K, string>>) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const values = useMemo(() => {
    const result = { ...defaults } as Record<K, string>;
    for (const key of Object.keys(defaults) as K[]) {
      const value = searchParams.get(key);
      if (value !== null) result[key] = value;
    }
    return result;
  }, [searchParams, defaults]);

  const update = useCallback(
    (patch: Partial<Record<K, string>>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch) as [K, string | undefined][]) {
        if (value === undefined || value === defaults[key]) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
    },
    [searchParams, pathname, defaults],
  );

  return [values, update] as const;
}

/**
 * Qidiruv maydoni: yozish tugagach (kechiktirib) qiymat `commit` ga uzatiladi. Saqlangan
 * qiymat tashqaridan o‘zgarsa (masalan, filtrlar tozalansa), maydon ham yangilanadi.
 */
export function useSearchDraft(committed: string, commit: (value: string) => void, delay = 350) {
  const [draft, setDraft] = useState(committed);
  const [previous, setPrevious] = useState(committed);
  if (committed !== previous) {
    setPrevious(committed);
    if (committed !== draft.trim()) setDraft(committed);
  }

  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  useEffect(() => {
    const value = draft.trim();
    if (value === committed) return;
    const timer = setTimeout(() => commitRef.current(value), delay);
    return () => clearTimeout(timer);
  }, [draft, committed, delay]);

  return [draft, setDraft] as const;
}

/** URLdan kelgan qiymat ruxsat etilgan ro‘yxatda bo‘lsagina qaytariladi. */
export function pickEnum<T extends string>(value: string, options: readonly T[]): T | undefined {
  return (options as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** URLdagi sahifa raqami (noto‘g‘ri qiymat — 1). */
export const pageNumber = (value: string) => Math.max(1, Number.parseInt(value, 10) || 1);
