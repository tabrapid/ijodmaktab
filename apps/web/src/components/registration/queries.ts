'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useDebouncedValue } from '@/components/admin/queries';
import { api, qs } from '@/lib/api';
import { afterLoginPath } from '@/lib/auth';
import type { LoginAvailability, Me, RegistrationOptions, RegistrationPage, RegistrationSettings } from '@/lib/types';

/** Ochiq sahifalar so‘rovlari (kirishsiz). */
export const registrationKeys = {
  options: ['registration', 'options'] as const,
  session: ['registration', 'session'] as const,
  login: (login: string) => ['registration', 'login-available', login] as const,
};

/** Direktor o‘rinbosari sahifasi so‘rovlari. */
export const registrationAdminKeys = {
  all: ['registrations'] as const,
  settings: ['registrations', 'settings'] as const,
  counts: ['registrations', 'counts'] as const,
  list: (view: RegistrationView, days: number, page: number) => ['registrations', 'list', view, days, page] as const,
};

export type RegistrationView = 'pending' | 'students' | 'teachers';

export function useRegistrationOptions() {
  return useQuery({
    queryKey: registrationKeys.options,
    queryFn: () => api.get<RegistrationOptions>('/registration/options'),
    staleTime: 60_000,
  });
}

/**
 * Tizimga kirgan foydalanuvchi ro‘yxatdan o‘tish sahifalarini ko‘rmaydi — o‘z bosh sahifasiga o‘tadi.
 * Kirmaganlik (401) xato sifatida umumiy ishlovchiga yetib bormaydi: u kirish sahifasiga yo‘naltirardi.
 * Muddati o‘tgan cookie ham sahifani to‘smaydi (umumiy kompyuterlarda ko‘p uchraydi).
 * `hasSession` — sahifa serverda kirish cookie’si borligini aniqlab beradi (cookie httpOnly).
 */
export function useSignedInRedirect(hasSession: boolean) {
  const router = useRouter();
  const session = useQuery({
    queryKey: registrationKeys.session,
    queryFn: () => api.get<Me>('/auth/me').catch(() => null),
    // Kirish cookie’si bo‘lmasa server so‘ralmaydi (aks holda har tashrifda keraksiz 401 bo‘ladi).
    enabled: hasSession,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  useEffect(() => {
    if (session.data) router.replace(afterLoginPath(session.data));
  }, [session.data, router]);
  return {
    checking: hasSession && (session.isPending || Boolean(session.data)),
    recheck: () => session.refetch(),
  };
}

/** Login qoidasi (`loginValue` bilan bir xil): 3–50 ta lotin harfi, raqam, nuqta, chiziqcha, pastki chiziq. */
export const LOGIN_PATTERN = /^[a-z0-9._-]{3,50}$/;

export type LoginCheck =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken'; suggestion?: string }
  /** Tekshirib bo‘lmadi (masalan, juda ko‘p so‘rov) — yuborishda server baribir tekshiradi. */
  | { state: 'unknown' };

/** Login bandligini yozish to‘xtagach tekshiradi (har harfda so‘rov yuborilmaydi). */
export function useLoginAvailability(value: string | undefined): LoginCheck {
  const login = (value ?? '').trim().toLowerCase();
  const debounced = useDebouncedValue(login, 450);
  const valid = LOGIN_PATTERN.test(debounced);
  const query = useQuery({
    queryKey: registrationKeys.login(debounced),
    queryFn: () => api.get<LoginAvailability>(`/registration/login-available${qs({ login: debounced })}`),
    enabled: valid,
    staleTime: 30_000,
    retry: false,
  });
  if (!LOGIN_PATTERN.test(login)) return { state: 'idle' };
  if (debounced !== login || query.isPending) return { state: 'checking' };
  if (query.isError) return { state: 'unknown' };
  return query.data.available ? { state: 'available' } : { state: 'taken', suggestion: query.data.suggestion };
}

// ---------------------------------------------------------------- Direktor o‘rinbosari

export function useRegistrationSettings() {
  return useQuery({
    queryKey: registrationAdminKeys.settings,
    queryFn: () => api.get<RegistrationSettings>('/registrations/settings'),
  });
}

/** Tasdiq kutayotgan o‘qituvchilar soni (yorliqdagi belgi uchun). */
export function usePendingCount() {
  return useQuery({
    queryKey: registrationAdminKeys.counts,
    queryFn: () =>
      api
        .get<RegistrationPage<unknown>>(`/registrations${qs({ view: 'pending', pageSize: 1 })}`)
        .then((result) => result.counts),
    refetchInterval: 60_000,
  });
}

export const REGISTRATION_PAGE_SIZE = 25;

export function registrationListPath(view: RegistrationView, days: number, page: number) {
  return `/registrations${qs({ view, days, page, pageSize: REGISTRATION_PAGE_SIZE })}`;
}
