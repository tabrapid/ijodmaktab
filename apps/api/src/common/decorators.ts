import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@ijod/shared';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC = 'ijod:isPublic';
export const ROLES = 'ijod:roles';
export const ALLOW_PASSWORD_CHANGE_PENDING = 'ijod:allowPasswordChangePending';
export const ALLOW_MFA_PENDING = 'ijod:allowMfaPending';

/** Kirishsiz ochiq manzil. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Faqat ko‘rsatilgan rollardan biriga ega foydalanuvchilar uchun. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Vaqtinchalik parolni almashtirmagan foydalanuvchi ham foydalana oladi. */
export const AllowPasswordChangePending = () => SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING, true);

/** Ikki bosqichli tasdiqdan hali o‘tmagan sessiya ham foydalana oladi. */
export const AllowMfaPending = () => SetMetadata(ALLOW_MFA_PENDING, true);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  return request.user;
});
