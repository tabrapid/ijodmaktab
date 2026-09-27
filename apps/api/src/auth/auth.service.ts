import { HttpStatus, Injectable } from '@nestjs/common';
import { fullName, type Role } from '@ijod/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { AppError, badRequest, forbidden, unauthorized } from '../common/errors.js';
import { AppConfig } from '../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './passwords.js';
import { SecretBox } from './secret-box.js';
import { SessionService, type SessionMeta } from './session.service.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp.js';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const TOTP_ISSUER = 'Ijod maktabi';

const invalidCredentials = () =>
  unauthorized('Login yoki parol noto‘g‘ri.', 'INVALID_CREDENTIALS');

const accountLocked = (until: Date) => {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return new AppError(
    HttpStatus.FORBIDDEN,
    'ACCOUNT_LOCKED',
    `Ko‘p marta noto‘g‘ri parol kiritilgani uchun hisob vaqtincha bloklandi. ${minutes} daqiqadan so‘ng qayta urinib ko‘ring yoki administratorga murojaat qiling.`,
    { lockedUntil: until },
  );
};

export interface MeResponse {
  id: string;
  internalId: number;
  login: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  fullName: string;
  roles: Role[];
  realm: 'SCHOOL' | 'SYSTEM';
  mustChangePassword: boolean;
  mfa: { enabled: boolean; verified: boolean; required: boolean };
  homeroomClassIds: string[];
}

@Injectable()
export class AuthService {
  private readonly secrets: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    config: AppConfig,
  ) {
    this.secrets = new SecretBox(config.encryptionKey);
  }

  /** Ikki bosqichli tasdiq talab qilinadimi: super admin uchun har doim, boshqalar uchun yoqilgan bo‘lsa. */
  static mfaRequired(user: Pick<AuthUser, 'realm' | 'mfaEnabled'>) {
    return user.realm === 'SYSTEM' || user.mfaEnabled;
  }

  async login(input: { login: string; password: string }, realm: 'SCHOOL' | 'SYSTEM', meta: SessionMeta) {
    const login = input.login.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { login }, include: { roles: true } });

    if (!user) {
      await burnPasswordCheck(input.password);
      await this.audit.log('auth.login_failed', null, { login, realm, reason: 'unknown_login' }, { actor: null });
      throw invalidCredentials();
    }

    const roles = user.roles.map((assignment) => assignment.role as Role);
    const actor = { id: user.id, roles };
    const isSuperAdmin = roles.includes('SUPER_ADMIN');

    // Super admin hisobi faqat alohida kirish manzilidan, boshqalar esa faqat oddiy kirishdan.
    if ((realm === 'SYSTEM') !== isSuperAdmin) {
      await burnPasswordCheck(input.password);
      await this.audit.log('auth.login_failed', { type: 'User', id: user.id }, { realm, reason: 'wrong_realm' }, { actor });
      throw invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.audit.log('auth.login_blocked', { type: 'User', id: user.id }, { realm }, { actor });
      throw accountLocked(user.lockedUntil);
    }

    const passwordOk = await verifyPassword(user.passwordHash, input.password);
    if (!passwordOk) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      const lockedUntil = lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: lock ? 0 : failed, lockedUntil },
      });
      await this.audit.log(
        lock ? 'auth.account_locked' : 'auth.login_failed',
        { type: 'User', id: user.id },
        { realm, reason: 'wrong_password', failedCount: failed },
        { actor },
      );
      if (lockedUntil) throw accountLocked(lockedUntil);
      throw invalidCredentials();
    }

    if (user.status !== 'ACTIVE') {
      await this.audit.log('auth.login_failed', { type: 'User', id: user.id }, { realm, reason: 'inactive' }, { actor });
      throw forbidden('Hisob faol emas. Administratorga murojaat qiling.', 'ACCOUNT_DISABLED');
    }

    const now = new Date();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, lastActiveAt: now },
    });
    const { token, session } = await this.sessions.create(user.id, realm, meta);
    await this.audit.log('auth.login', { type: 'User', id: user.id }, { realm, sessionId: session.id }, { actor });

    const authUser: AuthUser = {
      id: user.id,
      internalId: user.internalId,
      login: user.login,
      lastName: user.lastName,
      firstName: user.firstName,
      middleName: user.middleName,
      roles,
      sessionId: session.id,
      realm,
      mustChangePassword: user.mustChangePassword,
      mfaEnabled: Boolean(user.totpEnabledAt),
      mfaVerified: false,
    };
    return { token, me: await this.me(authUser) };
  }

  async logout(user: AuthUser) {
    await this.sessions.revoke(user.sessionId, 'logout');
    await this.audit.log('auth.logout', { type: 'User', id: user.id });
  }

  async me(user: AuthUser): Promise<MeResponse> {
    const homeroom = user.roles.includes('TEACHER')
      ? await this.prisma.class.findMany({
          where: { homeroomTeacherId: user.id, archivedAt: null, academicYear: { isCurrent: true } },
          select: { id: true },
        })
      : [];
    return {
      id: user.id,
      internalId: user.internalId,
      login: user.login,
      lastName: user.lastName,
      firstName: user.firstName,
      middleName: user.middleName,
      fullName: fullName(user),
      roles: user.roles,
      realm: user.realm,
      mustChangePassword: user.mustChangePassword,
      mfa: {
        enabled: user.mfaEnabled,
        verified: user.mfaVerified,
        required: AuthService.mfaRequired(user),
      },
      homeroomClassIds: homeroom.map((item) => item.id),
    };
  }

  async changePassword(user: AuthUser, currentPassword: string, newPassword: string) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(record.passwordHash, currentPassword))) {
      await this.audit.log('auth.password_change_failed', { type: 'User', id: user.id });
      throw badRequest('WRONG_PASSWORD', 'Joriy parol noto‘g‘ri.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    // Boshqa qurilmalardagi sessiyalar bekor qilinadi, joriy sessiya qoladi.
    await this.sessions.revokeAllForUser(user.id, 'password_changed', user.sessionId);
    await this.audit.log('auth.password_changed', { type: 'User', id: user.id });
  }

  // ------------------------------------------------------------ Ikki bosqichli kirish

  async startMfaSetup(user: AuthUser) {
    if (user.mfaEnabled && !user.mfaVerified) {
      throw forbidden('Avval joriy ikki bosqichli tasdiqdan o‘ting.', 'MFA_REQUIRED');
    }
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpPendingSecret: this.secrets.seal(secret) },
    });
    return {
      secret,
      otpauthUrl: otpauthUrl({ issuer: TOTP_ISSUER, account: user.login, secret }),
    };
  }

  async confirmMfaSetup(user: AuthUser, code: string) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!record.totpPendingSecret) {
      throw badRequest('MFA_SETUP_NOT_STARTED', 'Avval ikki bosqichli kirishni sozlashni boshlang.');
    }
    const secret = this.secrets.open(record.totpPendingSecret);
    const step = verifyTotp(secret, code);
    if (step === null) throw badRequest('INVALID_CODE', 'Kod noto‘g‘ri yoki muddati o‘tgan.');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecret: record.totpPendingSecret,
        totpPendingSecret: null,
        totpEnabledAt: new Date(),
        totpLastStep: step,
      },
    });
    await this.sessions.markMfaVerified(user.sessionId);
    await this.sessions.revokeAllForUser(user.id, 'mfa_enabled', user.sessionId);
    await this.audit.log('auth.mfa_enabled', { type: 'User', id: user.id });
  }

  async verifyMfa(user: AuthUser, code: string) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!record.totpSecret) {
      throw forbidden('Ikki bosqichli kirish hali sozlanmagan.', 'MFA_SETUP_REQUIRED');
    }
    const step = verifyTotp(this.secrets.open(record.totpSecret), code);
    if (step === null || (record.totpLastStep !== null && step <= record.totpLastStep)) {
      await this.audit.log('auth.mfa_failed', { type: 'User', id: user.id });
      throw badRequest('INVALID_CODE', 'Kod noto‘g‘ri yoki allaqachon ishlatilgan.');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
    await this.sessions.markMfaVerified(user.sessionId);
    await this.audit.log('auth.mfa_verified', { type: 'User', id: user.id });
  }

  async disableMfa(user: AuthUser, code: string) {
    if (user.realm === 'SYSTEM') {
      throw forbidden('Super admin uchun ikki bosqichli kirishni o‘chirib bo‘lmaydi.');
    }
    await this.verifyMfa(user, code);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null },
    });
    await this.audit.log('auth.mfa_disabled', { type: 'User', id: user.id });
  }
}
