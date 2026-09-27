'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { useThemeSync } from '@/lib/theme';

const PUBLIC_PATHS = ['/login', '/system/login'];

/** Sessiya tugasa yoki qo‘shimcha talab bo‘lsa, foydalanuvchi tegishli sahifaga yo‘naltiriladi. */
function handleAuthError(error: unknown) {
  if (!(error instanceof ApiError) || typeof window === 'undefined') return;
  const { pathname, search } = window.location;
  if (error.status === 401 && !PUBLIC_PATHS.includes(pathname)) {
    const system = pathname.startsWith('/system');
    window.location.assign(`${system ? '/system/login' : '/login'}?next=${encodeURIComponent(pathname + search)}`);
  } else if (error.status === 403 && error.code === 'PASSWORD_CHANGE_REQUIRED' && pathname !== '/change-password') {
    window.location.assign('/change-password');
  } else if (error.status === 403 && error.code.startsWith('MFA_') && pathname !== '/mfa') {
    window.location.assign(`/mfa?next=${encodeURIComponent(pathname + search)}`);
  }
}

function makeClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleAuthError }),
    mutationCache: new MutationCache({ onError: handleAuthError }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  // “Tizim bo‘yicha” mavzu OS o‘zgarishiga har bir sahifada darhol ergashadi.
  useThemeSync();
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
