import type { Role } from '@ijod/shared';

/** So‘rov egasi — kirish sessiyasidan tiklangan foydalanuvchi. */
export interface AuthUser {
  id: string;
  internalId: number;
  login: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  roles: Role[];
  sessionId: string;
  realm: 'SCHOOL' | 'SYSTEM';
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  mfaVerified: boolean;
}

export const hasRole = (user: Pick<AuthUser, 'roles'>, ...roles: Role[]) =>
  roles.some((role) => user.roles.includes(role));

export const isStaff = (user: Pick<AuthUser, 'roles'>) => hasRole(user, 'TEACHER', 'DEPUTY', 'ADMIN', 'SUPER_ADMIN');

/** Rahbariyat (direktor o‘rinbosari) yoki super admin: butun maktab bo‘yicha pedagogik ko‘rinish. */
export const isLeadership = (user: Pick<AuthUser, 'roles'>) => hasRole(user, 'DEPUTY', 'SUPER_ADMIN');
