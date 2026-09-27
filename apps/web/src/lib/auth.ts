'use client';

import { useQuery } from '@tanstack/react-query';
import type { Role } from '@ijod/shared';
import { api } from './api';
import type { Me } from './types';

export const ME_KEY = ['me'] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => api.get<Me>('/auth/me'),
    staleTime: 60_000,
    retry: false,
  });
}

export const hasRole = (me: Pick<Me, 'roles'> | undefined | null, ...roles: Role[]) =>
  Boolean(me && roles.some((role) => me.roles.includes(role)));

/** Rol bo‘yicha bosh sahifa (bir nechta rolda — eng keng vakolatli panel). */
export function homeFor(me: Pick<Me, 'roles'>): string {
  if (me.roles.includes('SUPER_ADMIN')) return '/system';
  if (me.roles.includes('DEPUTY')) return '/management';
  if (me.roles.includes('ADMIN')) return '/admin';
  if (me.roles.includes('TEACHER')) return '/teacher';
  return '/student';
}

/** Kirishdan keyingi manzil: parol almashtirish va 2FA talablari hisobga olinadi. */
export function afterLoginPath(me: Me, next?: string | null): string {
  if (me.mfa.required && !me.mfa.verified) return next ? `/mfa?next=${encodeURIComponent(next)}` : '/mfa';
  if (me.mustChangePassword) return '/change-password';
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return homeFor(me);
}
