import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CookieOptions } from 'express';
import type { Role } from '@ijod/shared';
import type { AuthUser } from '../common/auth-user.js';
import { AppConfig } from '../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const SESSION_COOKIE = 'ijod_sid';

/** Oxirgi faollik vaqtini har so‘rovda emas, shu oraliqda bir marta yangilaymiz. */
const TOUCH_INTERVAL_MS = 60_000;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface SessionMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Kirish sessiyalari bazada saqlanadi: istalgan sessiyani darhol bekor qilish mumkin
 * (parol almashtirilganda, hisob faolsizlantirilganda yoki foydalanuvchi so‘raganda).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async create(userId: string, realm: 'SCHOOL' | 'SYSTEM', meta: SessionMeta) {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        realm,
        tokenHash: hashToken(token),
        expiresAt: new Date(now + this.config.sessionTtlMs),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    return { token, session };
  }

  async resolve(token: string): Promise<AuthUser | null> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { roles: true } } },
    });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;
    if (now - session.createdAt.getTime() > this.config.sessionAbsoluteTtlMs) return null;
    if (session.user.status !== 'ACTIVE') return null;

    const roles = session.user.roles.map((assignment) => assignment.role as Role);
    // Super admin faqat alohida (SYSTEM) kirish orqali ishlaydi.
    if ((session.realm === 'SYSTEM') !== roles.includes('SUPER_ADMIN')) return null;

    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      const touchedAt = new Date(now);
      await this.prisma.$transaction([
        this.prisma.authSession.update({
          where: { id: session.id },
          data: { lastSeenAt: touchedAt, expiresAt: new Date(now + this.config.sessionTtlMs) },
        }),
        this.prisma.user.update({ where: { id: session.userId }, data: { lastActiveAt: touchedAt } }),
      ]);
    }

    const user = session.user;
    return {
      id: user.id,
      internalId: user.internalId,
      login: user.login,
      lastName: user.lastName,
      firstName: user.firstName,
      middleName: user.middleName,
      roles,
      sessionId: session.id,
      realm: session.realm,
      mustChangePassword: user.mustChangePassword,
      mfaEnabled: Boolean(user.totpEnabledAt),
      mfaVerified: Boolean(session.mfaVerifiedAt),
      avatarFileId: user.avatarFileId,
    };
  }

  markMfaVerified(sessionId: string) {
    return this.prisma.authSession.update({ where: { id: sessionId }, data: { mfaVerifiedAt: new Date() } });
  }

  revoke(sessionId: string, reason: string) {
    return this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  revokeAllForUser(userId: string, reason: string, exceptSessionId?: string) {
    return this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null, id: exceptSessionId ? { not: exceptSessionId } : undefined },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  listActive(userId: string) {
    return this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, realm: true, createdAt: true, lastSeenAt: true, ip: true, userAgent: true },
    });
  }

  /**
   * Cookie faqat server o‘qiydi (httpOnly). Muddat berilmagan — brauzer yopilganda o‘chadi,
   * bu maktabdagi umumiy kompyuterlar uchun xavfsizroq. Server tomonda esa faolsizlik muddati bor.
   */
  cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.config.cookieSecure, path: '/' };
  }
}
