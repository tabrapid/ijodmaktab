import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@ijod/shared';
import type { Request } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import {
  ALLOW_MFA_PENDING,
  ALLOW_PASSWORD_CHANGE_PENDING,
  IS_PUBLIC,
  ROLES,
} from '../common/decorators.js';
import { forbidden, unauthorized } from '../common/errors.js';
import { requestContext } from '../common/request-context.js';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

/**
 * Har so‘rovda foydalanuvchi, sessiya holati va rol tekshiriladi.
 * Resurs darajasidagi tekshiruv (sinf, egasi) xizmatlarning o‘zida bajariladi.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const targets = [context.getHandler(), context.getClass()];
    const flag = (key: string) => this.reflector.getAllAndOverride<boolean>(key, targets) ?? false;

    const token: unknown = request.cookies?.[SESSION_COOKIE];
    const user = typeof token === 'string' && token ? await this.sessions.resolve(token) : null;
    if (user) {
      request.user = user;
      requestContext.setUser(user);
    }

    if (flag(IS_PUBLIC)) return true;
    if (!user) throw unauthorized('Sessiya muddati tugagan yoki tizimga kirilmagan.', 'UNAUTHORIZED');

    if (AuthService.mfaRequired(user) && !user.mfaVerified && !flag(ALLOW_MFA_PENDING)) {
      throw user.mfaEnabled
        ? forbidden('Ikki bosqichli tasdiq kodini kiriting.', 'MFA_REQUIRED')
        : forbidden('Avval ikki bosqichli kirishni sozlang.', 'MFA_SETUP_REQUIRED');
    }

    if (user.mustChangePassword && !flag(ALLOW_PASSWORD_CHANGE_PENDING)) {
      throw forbidden('Davom etish uchun vaqtinchalik parolni almashtiring.', 'PASSWORD_CHANGE_REQUIRED');
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.some((role) => user.roles.includes(role))) {
      throw forbidden();
    }
    return true;
  }
}
