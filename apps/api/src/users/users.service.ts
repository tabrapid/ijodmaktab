import { Injectable } from '@nestjs/common';
import { fullName, loginFromName, normalizeForSearch, userSearchText, type Role, type UserStatus } from '@ijod/shared';
import type { z } from 'zod';
import type { createUserSchema, updateUserSchema, userListQuerySchema } from '@ijod/shared';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import { generateTemporaryPassword, hashPassword } from '../auth/passwords.js';
import { SessionService } from '../auth/session.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole } from '../common/auth-user.js';
import { dateOnly } from '../common/dates.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';

type UserListQuery = z.output<typeof userListQuerySchema>;

/** Administrator beradigan rollar; ADMIN va SUPER_ADMIN rollarini faqat super admin beradi. */
const ADMIN_GRANTABLE: readonly Role[] = ['STUDENT', 'TEACHER', 'DEPUTY'];

const listInclude = {
  roles: { select: { role: true } },
  enrollments: {
    where: { endsOn: null, academicYear: { isCurrent: true } },
    select: { class: { select: { id: true, name: true } } },
    take: 1,
  },
} satisfies Prisma.UserInclude;

type ListUser = Prisma.UserGetPayload<{ include: typeof listInclude }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  private isAccountManager(viewer: AuthUser) {
    return hasRole(viewer, 'ADMIN', 'SUPER_ADMIN');
  }

  private toListItem(user: ListUser, viewer: AuthUser) {
    const manager = this.isAccountManager(viewer);
    return {
      id: user.id,
      internalId: user.internalId,
      lastName: user.lastName,
      firstName: user.firstName,
      middleName: user.middleName,
      fullName: fullName(user),
      roles: user.roles.map((item) => item.role as Role),
      status: user.status as UserStatus,
      currentClass: user.enrollments[0]?.class ?? null,
      lastActiveAt: user.lastActiveAt,
      ...(manager
        ? {
            login: user.login,
            locked: Boolean(user.lockedUntil && user.lockedUntil > new Date()),
            mustChangePassword: user.mustChangePassword,
          }
        : {}),
    };
  }

  async list(viewer: AuthUser, query: UserListQuery) {
    const where: Prisma.UserWhereInput = { AND: [] };
    const and = where.AND as Prisma.UserWhereInput[];

    if (!this.access.seesAllStudents(viewer)) {
      // O‘qituvchi faqat biriktirilgan sinflaridagi o‘quvchilarni ko‘radi.
      const classIds = hasRole(viewer, 'TEACHER') ? await this.access.teacherClassIds(viewer.id) : [];
      and.push({
        roles: { some: { role: 'STUDENT' } },
        enrollments: { some: { classId: { in: classIds }, endsOn: null } },
      });
    }
    if (!hasRole(viewer, 'SUPER_ADMIN')) {
      // Super admin hisoblari oddiy foydalanuvchilarga ko‘rsatilmaydi.
      and.push({ roles: { none: { role: 'SUPER_ADMIN' } } });
    }
    if (query.role) and.push({ roles: { some: { role: query.role } } });
    if (query.status) and.push({ status: query.status });
    if (query.classId) and.push({ enrollments: { some: { classId: query.classId, endsOn: null } } });
    // Ogohlantirish filtrlari administrator bosh sahifasidagi hisoblar bilan bir xil shartda.
    if (query.flag && this.isAccountManager(viewer)) {
      if (query.flag === 'locked') and.push({ lockedUntil: { gt: new Date() } });
      if (query.flag === 'mustChangePassword') and.push({ status: 'ACTIVE', mustChangePassword: true });
      if (query.flag === 'noClass') {
        const year = await this.access.currentYear();
        and.push({
          status: 'ACTIVE',
          roles: { some: { role: 'STUDENT' } },
          enrollments: { none: { endsOn: null, academicYearId: year?.id } },
        });
      }
    }
    if (query.q) {
      const text = normalizeForSearch(query.q);
      const asNumber = /^\d+$/.test(query.q.trim()) ? Number(query.q.trim()) : null;
      and.push({
        OR: [{ searchText: { contains: text } }, ...(asNumber !== null ? [{ internalId: asNumber }] : [])],
      });
    }

    const direction = query.order;
    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      query.sort === 'internalId'
        ? [{ internalId: direction }]
        : query.sort === 'lastActive'
          ? [{ lastActiveAt: { sort: direction, nulls: 'last' } }, { internalId: 'asc' }]
          : query.sort === 'createdAt'
            ? [{ createdAt: direction }, { internalId: 'asc' }]
            : [{ lastName: direction }, { firstName: direction }, { internalId: 'asc' }];

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy, include: listInclude, ...pageArgs(query) }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(
      items.map((user) => this.toListItem(user, viewer)),
      total,
      query,
    );
  }

  /** Test ulashish va o‘tkazuvchi tanlash uchun xodimlar ro‘yxati (faqat ism va rol). */
  async staffDirectory(q?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: { some: { role: { in: ['TEACHER', 'DEPUTY'] } } },
        searchText: q ? { contains: normalizeForSearch(q) } : undefined,
      },
      include: { roles: { select: { role: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 100,
    });
    return users.map((user) => ({
      id: user.id,
      fullName: fullName(user),
      roles: user.roles.map((item) => item.role as Role),
    }));
  }

  async detail(viewer: AuthUser, id: string) {
    if (!(await this.access.canViewStudent(viewer, id))) throw notFound('Foydalanuvchi');
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: { select: { role: true } },
        enrollments: {
          include: { class: { select: { id: true, name: true } }, academicYear: { select: { name: true } } },
          orderBy: { startsOn: 'desc' },
        },
        teachingAssignments: {
          where: { academicYear: { isCurrent: true } },
          include: { class: { select: { id: true, name: true } }, subject: { select: { id: true, name: true } } },
        },
        homeroomClasses: { where: { academicYear: { isCurrent: true } }, select: { id: true, name: true } },
      },
    });
    if (!user) throw notFound('Foydalanuvchi');
    const roles = user.roles.map((item) => item.role as Role);
    if (roles.includes('SUPER_ADMIN') && !hasRole(viewer, 'SUPER_ADMIN')) throw notFound('Foydalanuvchi');

    const base = {
      id: user.id,
      internalId: user.internalId,
      lastName: user.lastName,
      firstName: user.firstName,
      middleName: user.middleName,
      fullName: fullName(user),
      roles,
      status: user.status as UserStatus,
      enrollments: user.enrollments.map((enrollment) => ({
        id: enrollment.id,
        class: enrollment.class,
        academicYear: enrollment.academicYear.name,
        academicYearId: enrollment.academicYearId,
        startsOn: enrollment.startsOn,
        endsOn: enrollment.endsOn,
        endReason: enrollment.endReason,
      })),
    };
    // O‘qituvchi o‘quvchining faqat o‘quvga zarur maydonlarini ko‘radi.
    if (!this.access.seesAllStudents(viewer) && viewer.id !== id) return base;

    return {
      ...base,
      teachingAssignments: user.teachingAssignments.map((item) => ({
        id: item.id,
        class: item.class,
        subject: item.subject,
      })),
      homeroomClasses: user.homeroomClasses,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      lastActiveAt: user.lastActiveAt,
      statusReason: user.statusReason,
      ...(this.isAccountManager(viewer)
        ? {
            login: user.login,
            mustChangePassword: user.mustChangePassword,
            lockedUntil: user.lockedUntil && user.lockedUntil > new Date() ? user.lockedUntil : null,
            mfaEnabled: Boolean(user.totpEnabledAt),
          }
        : {}),
    };
  }

  // ------------------------------------------------------------ Yaratish va o‘zgartirish

  private assertCanGrant(viewer: AuthUser, roles: readonly Role[]) {
    if (hasRole(viewer, 'SUPER_ADMIN')) return;
    const denied = roles.filter((role) => !ADMIN_GRANTABLE.includes(role));
    if (denied.length) {
      throw forbidden('Administrator va super admin rollarini faqat super admin beradi.');
    }
  }

  private async assertManageable(viewer: AuthUser, targetId: string) {
    if (targetId === viewer.id) {
      throw forbidden('O‘z hisobingiz uchun bu amalni bajarib bo‘lmaydi.', 'SELF_ACTION');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: { roles: { select: { role: true } } },
    });
    if (!target) throw notFound('Foydalanuvchi');
    const roles = target.roles.map((item) => item.role as Role);
    if (!hasRole(viewer, 'SUPER_ADMIN') && roles.some((role) => !ADMIN_GRANTABLE.includes(role))) {
      if (roles.includes('SUPER_ADMIN')) throw notFound('Foydalanuvchi');
      throw forbidden('Administrator hisoblarini faqat super admin boshqaradi.');
    }
    return { target, roles };
  }

  /** Band bo‘lmagan login topadi: zebo.karimova, zebo.karimova2, ... */
  async uniqueLogin(
    firstName: string,
    lastName: string,
    reserved: Set<string> = new Set(),
    tx: Tx | PrismaService = this.prisma,
  ) {
    const base = loginFromName(firstName, lastName);
    const existing = await tx.user.findMany({
      where: { login: { startsWith: base } },
      select: { login: true },
    });
    const taken = new Set([...existing.map((item) => item.login), ...reserved]);
    if (!taken.has(base)) return base;
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${base}${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  async assertLoginFree(login: string, exceptUserId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { login }, select: { id: true } });
    if (existing && existing.id !== exceptUserId) {
      throw conflict('LOGIN_TAKEN', `“${login}” logini band. Boshqa login tanlang.`);
    }
  }

  async create(viewer: AuthUser, input: z.output<typeof createUserSchema>) {
    this.assertCanGrant(viewer, input.roles);
    if (input.login) await this.assertLoginFree(input.login);

    let classForEnrollment: { id: string; academicYearId: string; academicYear: { startsOn: Date } } | null = null;
    if (input.classId) {
      if (!input.roles.includes('STUDENT')) {
        throw badRequest('CLASS_FOR_NON_STUDENT', 'Sinf faqat o‘quvchi uchun tanlanadi.');
      }
      classForEnrollment = await this.prisma.class.findFirst({
        where: { id: input.classId, archivedAt: null, academicYear: { isCurrent: true } },
        include: { academicYear: { select: { startsOn: true } } },
      });
      if (!classForEnrollment) throw notFound('Sinf');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const user = await this.prisma.$transaction(async (tx) => {
      const login = input.login ?? (await this.uniqueLogin(input.firstName, input.lastName, new Set(), tx));
      const created = await tx.user.create({
        data: {
          login,
          passwordHash,
          mustChangePassword: true,
          lastName: input.lastName,
          firstName: input.firstName,
          middleName: input.middleName,
          searchText: userSearchText({ ...input, login }),
          roles: { create: input.roles.map((role) => ({ role, grantedById: viewer.id })) },
        },
      });
      if (classForEnrollment) {
        await tx.enrollment.create({
          data: {
            studentId: created.id,
            classId: classForEnrollment.id,
            academicYearId: classForEnrollment.academicYearId,
            startsOn: laterOf(dateOnly(), classForEnrollment.academicYear.startsOn),
          },
        });
      }
      await this.audit.log(
        'user.create',
        { type: 'User', id: created.id },
        { login, roles: input.roles, classId: input.classId ?? null },
        { tx },
      );
      return created;
    });

    return { user: await this.detail(viewer, user.id), temporaryPassword };
  }

  async update(viewer: AuthUser, id: string, input: z.output<typeof updateUserSchema>) {
    const { target } = await this.assertManageableOrSelf(viewer, id);
    if (input.login && input.login !== target.login) await this.assertLoginFree(input.login, id);
    const next = {
      lastName: input.lastName ?? target.lastName,
      firstName: input.firstName ?? target.firstName,
      middleName: input.middleName === undefined ? target.middleName : input.middleName,
      login: input.login ?? target.login,
    };
    await this.prisma.user.update({
      where: { id },
      data: { ...next, searchText: userSearchText(next) },
    });
    await this.audit.log(
      'user.update',
      { type: 'User', id },
      {
        before: {
          lastName: target.lastName,
          firstName: target.firstName,
          middleName: target.middleName,
          login: target.login,
        },
        after: next,
      },
    );
    return this.detail(viewer, id);
  }

  /** Administrator o‘zining ism-familiyasini ham tahrirlay oladi. */
  private async assertManageableOrSelf(viewer: AuthUser, id: string) {
    if (id === viewer.id) {
      const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });
      return { target };
    }
    return this.assertManageable(viewer, id);
  }

  async setRoles(viewer: AuthUser, id: string, roles: Role[]) {
    const { roles: before } = await this.assertManageable(viewer, id);
    this.assertCanGrant(viewer, roles);
    if (roles.includes('SUPER_ADMIN') && roles.length > 1) {
      throw badRequest('INVALID_ROLES', 'Super admin hisobi boshqa rollar bilan birlashtirilmaydi.');
    }
    if (before.includes('SUPER_ADMIN') !== roles.includes('SUPER_ADMIN')) {
      throw badRequest('INVALID_ROLES', 'Super admin hisobini oddiy hisobga (yoki aksincha) aylantirib bo‘lmaydi.');
    }
    const unique = [...new Set(roles)];
    await this.prisma.$transaction(async (tx) => {
      await tx.roleAssignment.deleteMany({ where: { userId: id, role: { notIn: unique } } });
      for (const role of unique.filter((item) => !before.includes(item))) {
        await tx.roleAssignment.create({ data: { userId: id, role, grantedById: viewer.id } });
      }
      await this.audit.log('user.roles_changed', { type: 'User', id }, { before, after: unique }, { tx });
    });
    return this.detail(viewer, id);
  }

  async setStatus(viewer: AuthUser, id: string, status: UserStatus, reason: string | null) {
    const { target } = await this.assertManageable(viewer, id);
    if (target.status === status) return this.detail(viewer, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          status,
          statusReason: reason,
          archivedAt: status === 'ARCHIVED' ? new Date() : status === 'ACTIVE' ? null : target.archivedAt,
        },
      });
      if (status === 'ARCHIVED') {
        // Arxivlanganda faol sinf a’zoligi yopiladi, tarixiy ma’lumotlar saqlanadi.
        await tx.enrollment.updateMany({
          where: { studentId: id, endsOn: null },
          data: { endsOn: dateOnly(), endReason: 'OTHER' },
        });
      }
      await this.audit.log(
        'user.status_changed',
        { type: 'User', id },
        { before: target.status, after: status, reason },
        { tx },
      );
    });
    if (status !== 'ACTIVE') await this.sessions.revokeAllForUser(id, `status_${status.toLowerCase()}`);
    return this.detail(viewer, id);
  }

  async resetPassword(viewer: AuthUser, id: string) {
    await this.assertManageable(viewer, id);
    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await this.sessions.revokeAllForUser(id, 'password_reset');
    await this.audit.log('user.password_reset', { type: 'User', id });
    return { temporaryPassword };
  }

  async unlock(viewer: AuthUser, id: string) {
    await this.assertManageable(viewer, id);
    await this.prisma.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null } });
    await this.audit.log('user.unlocked', { type: 'User', id });
    return { ok: true };
  }

  async revokeSessions(viewer: AuthUser, id: string) {
    await this.assertManageable(viewer, id);
    const result = await this.sessions.revokeAllForUser(id, 'revoked_by_admin');
    await this.audit.log('user.sessions_revoked', { type: 'User', id }, { count: result.count });
    return { revoked: result.count };
  }

  /**
   * Butunlay o‘chirish faqat tarixiy ma’lumoti yo‘q (masalan, xato yaratilgan) hisob uchun.
   * Aks holda hisob arxivlanadi yoki faolsizlantiriladi.
   */
  async remove(viewer: AuthUser, id: string) {
    const { target } = await this.assertManageable(viewer, id);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.enrollment.deleteMany({ where: { studentId: id } });
        await tx.user.delete({ where: { id } });
        await this.audit.log(
          'user.delete',
          { type: 'User', id },
          { login: target.login, name: fullName(target) },
          { tx },
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2014'].includes(error.code)) {
        throw conflict(
          'HAS_HISTORY',
          'Hisobning tarixiy ma’lumotlari bor (kirishlar, testlar, natijalar). Uni o‘chirish o‘rniga arxivlang yoki faolsizlantiring.',
        );
      }
      throw error;
    }
    return { ok: true };
  }
}

const laterOf = (a: Date, b: Date) => (a > b ? a : b);
