import { HttpStatus, Injectable } from '@nestjs/common';
import {
  canManageRoles,
  checkPinfl,
  fullName,
  maskPinfl,
  normalizeForSearch,
  userSearchText,
  type managementStudentsQuerySchema,
  type RegistrationSource,
  type Role,
  type studentIdentityUpdateSchema,
  type UserStatus,
} from '@ijod/shared';
import type { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { avatarUrlOf } from '../common/auth-user.js';
import { dateOnly, isoDateOnly } from '../common/dates.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { pageArgs } from '../common/pagination.js';
import { PinflVault } from '../common/pinfl-vault.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { emptyCounts, personSelect, personView, portfolioCounts, studentPortfolioSummary } from './student-views.js';

type ListQuery = z.output<typeof managementStudentsQuerySchema>;
type IdentityInput = z.output<typeof studentIdentityUpdateSchema>;

/** Ro‘yxat so‘rovining bitta qatori (o‘quvchi, joriy sinfi va sinf rahbari). */
interface ListRow {
  id: string;
  internalId: number;
  lastName: string;
  firstName: string;
  middleName: string | null;
  avatarFileId: string | null;
  status: UserStatus;
  registrationSource: RegistrationSource;
  createdAt: Date;
  lastLoginAt: Date | null;
  birthDate: string | null;
  login: string;
  classId: string | null;
  className: string | null;
  gradeLevel: number | null;
  section: string | null;
  homeroomId: string | null;
  homeroomLastName: string | null;
  homeroomFirstName: string | null;
  homeroomMiddleName: string | null;
  groupCount: number;
  total: number;
}

/** LIKE uchun maxsus belgilar ekranlanadi. */
const likePattern = (value: string) => `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

const IDENTITY_FIELDS = ['lastName', 'firstName', 'middleName', 'birthDate', 'pinfl'] as const;
type IdentityField = (typeof IDENTITY_FIELDS)[number];

const profileSelect = {
  ...personSelect,
  internalId: true,
  login: true,
  birthDate: true,
  birthYear: true,
  pinflEncrypted: true,
  pinflHash: true,
  status: true,
  statusReason: true,
  registrationSource: true,
  createdAt: true,
  lastLoginAt: true,
  mustChangePassword: true,
  lockedUntil: true,
  roles: { select: { role: true } },
  enrollments: {
    orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      academicYearId: true,
      startsOn: true,
      endsOn: true,
      endReason: true,
      academicYear: { select: { name: true, isCurrent: true } },
      class: { select: { id: true, name: true, gradeLevel: true, homeroomTeacher: { select: personSelect } } },
    },
  },
} satisfies Prisma.UserSelect;

type ProfileSource = Prisma.UserGetPayload<{ select: typeof profileSelect }>;

/**
 * Rahbariyatning “O‘quvchilar” bo‘limi: butun maktab o‘quvchilari (11-sinfdan 7-sinfgacha), o‘quvchining
 * to‘liq profili va hujjatdagi shaxsiy ma’lumotlarni tuzatish. JSHSHIR faqat alohida so‘rov bilan
 * ochiladi (audit jurnaliga yoziladi), ro‘yxat va profilda — yashirilgan ko‘rinishda.
 */
@Injectable()
export class ManagementStudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly vault: PinflVault,
  ) {}

  // ------------------------------------------------------------ Ro‘yxat

  /**
   * O‘quvchilar joriy o‘quv yilidagi sinfi bo‘yicha: 11 → 7, parallel ichida A, B, D, keyin familiya va
   * ism; sinfsizlar oxirida. Holati bo‘yicha hech kim chiqarib tashlanmaydi (filtr bo‘lmasa).
   * Saralash, filtr, sahifalash va guruhlar soni — bitta SQL so‘rovda, portfolio sonlari — bitta
   * guruhlangan so‘rovda.
   */
  async list(query: ListQuery) {
    const year = await this.access.currentYear();
    const conditions: Prisma.Sql[] = [
      Prisma.sql`EXISTS (SELECT 1 FROM "RoleAssignment" ra WHERE ra."userId" = u.id AND ra.role = 'STUDENT')`,
    ];
    if (query.q) {
      const needle = normalizeForSearch(query.q);
      const digits = /^\d{1,9}$/.test(needle) ? Number(needle) : null;
      const pattern = likePattern(needle);
      conditions.push(
        digits === null
          ? Prisma.sql`(u."searchText" LIKE ${pattern} OR u.login LIKE ${pattern})`
          : Prisma.sql`(u."searchText" LIKE ${pattern} OR u.login LIKE ${pattern} OR u."internalId" = ${digits})`,
      );
    }
    if (query.classId) conditions.push(Prisma.sql`c.id = ${query.classId}::uuid`);
    if (query.gradeLevel) conditions.push(Prisma.sql`c."gradeLevel" = ${query.gradeLevel}`);
    if (query.status) conditions.push(Prisma.sql`u.status = ${query.status}::"UserStatus"`);
    if (query.source) conditions.push(Prisma.sql`u."registrationSource" = ${query.source}::"RegistrationSource"`);
    if (query.noClass === true) conditions.push(Prisma.sql`e.id IS NULL`);
    if (query.noClass === false) conditions.push(Prisma.sql`e.id IS NOT NULL`);

    // Joriy o‘quv yili belgilanmagan bo‘lsa, barcha o‘quvchilar “sinfsiz” ko‘rinadi.
    const from = Prisma.sql`
      FROM "User" u
      LEFT JOIN "Enrollment" e
        ON e."studentId" = u.id AND e."endsOn" IS NULL AND e."academicYearId" = ${year?.id ?? null}::uuid
      LEFT JOIN "Class" c ON c.id = e."classId"
      LEFT JOIN "User" h ON h.id = c."homeroomTeacherId"
      WHERE ${Prisma.join(conditions, ' AND ')}`;
    const { skip, take } = pageArgs(query);

    const rows = await this.prisma.$queryRaw<ListRow[]>`
      SELECT u.id, u."internalId", u."lastName", u."firstName", u."middleName", u."avatarFileId",
             u.status::text AS status, u."registrationSource"::text AS "registrationSource",
             u."createdAt", u."lastLoginAt", to_char(u."birthDate", 'YYYY-MM-DD') AS "birthDate", u.login,
             c.id AS "classId", c.name AS "className", c."gradeLevel", c.section,
             h.id AS "homeroomId", h."lastName" AS "homeroomLastName", h."firstName" AS "homeroomFirstName",
             h."middleName" AS "homeroomMiddleName",
             COUNT(*) OVER (PARTITION BY c.id)::int AS "groupCount",
             COUNT(*) OVER ()::int AS total
      ${from}
      ORDER BY c."gradeLevel" DESC NULLS LAST, c.section ASC NULLS LAST, c.name ASC NULLS LAST,
               u."lastName" ASC, u."firstName" ASC, u."middleName" ASC NULLS FIRST, u.id ASC
      LIMIT ${take} OFFSET ${skip}`;

    // Sahifadan tashqariga chiqilganda ham jami son to‘g‘ri bo‘lishi uchun.
    let total = rows[0]?.total ?? 0;
    if (rows.length === 0 && skip > 0) {
      const counted = await this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${from}`;
      total = counted[0]?.total ?? 0;
    }

    const counts = await portfolioCounts(
      this.prisma,
      rows.map((row) => row.id),
    );
    // Sinf guruhlari (sahifadagi tartibda) va har biridagi o‘quvchilar soni — filtrlangan natija bo‘yicha.
    const groups: { classId: string | null; count: number }[] = [];
    for (const row of rows) {
      const last = groups.at(-1);
      if (!last || last.classId !== row.classId) groups.push({ classId: row.classId, count: row.groupCount });
    }

    return {
      items: rows.map((row) => ({
        id: row.id,
        internalId: row.internalId,
        fullName: fullName(row),
        lastName: row.lastName,
        firstName: row.firstName,
        middleName: row.middleName,
        avatarUrl: avatarUrlOf(row.avatarFileId),
        classId: row.classId,
        className: row.className,
        gradeLevel: row.gradeLevel,
        section: row.section,
        homeroomTeacher: row.homeroomId
          ? {
              id: row.homeroomId,
              fullName: fullName({
                lastName: row.homeroomLastName ?? '',
                firstName: row.homeroomFirstName ?? '',
                middleName: row.homeroomMiddleName,
              }),
            }
          : null,
        status: row.status,
        registrationSource: row.registrationSource,
        createdAt: row.createdAt,
        lastLoginAt: row.lastLoginAt,
        birthDate: row.birthDate,
        login: row.login,
        portfolio: counts.get(row.id) ?? emptyCounts(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      groups,
    };
  }

  // ------------------------------------------------------------ Profil

  /** O‘quvchi (STUDENT roli bor foydalanuvchi) yoki 404. */
  private async findStudent(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: profileSelect });
    if (!user || !user.roles.some((entry) => entry.role === 'STUDENT')) throw notFound('O‘quvchi');
    return user;
  }

  /** Hisobni boshqarish mumkinmi (o‘z hisobi va vakolatdan tashqari rollar — yo‘q). */
  private manageable(viewer: AuthUser, user: ProfileSource) {
    return (
      user.id !== viewer.id &&
      canManageRoles(
        viewer.roles,
        user.roles.map((entry) => entry.role as Role),
      )
    );
  }

  /** Shifrlangan JSHSHIRni ochadi; kalit almashgan bo‘lsa — tushunarli xato. */
  private openPinfl(sealed: string) {
    try {
      return this.vault.open(sealed);
    } catch {
      throw new AppError(
        HttpStatus.CONFLICT,
        'PINFL_UNREADABLE',
        'Saqlangan JSHSHIRni o‘qib bo‘lmadi (shifrlash kaliti o‘zgargan bo‘lishi mumkin). JSHSHIRni hujjatdan qayta kiriting.',
      );
    }
  }

  private maskedPinfl(sealed: string | null) {
    if (!sealed) return null;
    try {
      return maskPinfl(this.vault.open(sealed));
    } catch {
      return null;
    }
  }

  async profile(viewer: AuthUser, id: string) {
    const user = await this.findStudent(id);
    return this.toProfile(viewer, user);
  }

  private async toProfile(viewer: AuthUser, user: ProfileSource) {
    const current = user.enrollments.find((item) => item.endsOn === null && item.academicYear.isCurrent);
    return {
      id: user.id,
      internalId: user.internalId,
      lastName: user.lastName,
      firstName: user.firstName,
      middleName: user.middleName,
      fullName: fullName(user),
      avatarUrl: avatarUrlOf(user.avatarFileId),
      birthDate: user.birthDate ? isoDateOnly(user.birthDate) : null,
      birthYear: user.birthYear,
      pinflMasked: this.maskedPinfl(user.pinflEncrypted),
      hasPinfl: Boolean(user.pinflEncrypted),
      login: user.login,
      status: user.status as UserStatus,
      statusReason: user.statusReason,
      registrationSource: user.registrationSource as RegistrationSource,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: user.mustChangePassword,
      locked: Boolean(user.lockedUntil && user.lockedUntil > new Date()),
      currentClass: current
        ? {
            id: current.class.id,
            name: current.class.name,
            gradeLevel: current.class.gradeLevel,
            enrollmentId: current.id,
            academicYearId: current.academicYearId,
            homeroomTeacher: personView(current.class.homeroomTeacher),
          }
        : null,
      enrollments: user.enrollments.map((item) => ({
        id: item.id,
        classId: item.class.id,
        className: item.class.name,
        academicYear: item.academicYear.name,
        startsOn: isoDateOnly(item.startsOn),
        endsOn: item.endsOn ? isoDateOnly(item.endsOn) : null,
        endReason: item.endReason,
      })),
      portfolio: await studentPortfolioSummary(this.prisma, user.id),
      manageable: this.manageable(viewer, user),
    };
  }

  // ------------------------------------------------------------ JSHSHIR

  /** JSHSHIRni to‘liq ko‘rsatish: har bir ko‘rish audit jurnaliga yoziladi (raqamning o‘zi yozilmaydi). */
  async revealPinfl(id: string) {
    const user = await this.findStudent(id);
    if (!user.pinflEncrypted) throw notFound('JSHSHIR');
    const pinfl = this.openPinfl(user.pinflEncrypted);
    await this.audit.log('user.pinfl_viewed', { type: 'User', id });
    return { pinfl };
  }

  // ------------------------------------------------------------ Shaxsiy ma’lumotlarni tuzatish

  /**
   * Hujjatdagidek F.I.Sh., tug‘ilgan sana va JSHSHIR. JSHSHIR natijaviy tug‘ilgan sanaga mos bo‘lishi
   * shart; boshqa hisobdagi JSHSHIR — 409. Auditda faqat o‘zgargan maydon nomlari saqlanadi.
   */
  async updateIdentity(viewer: AuthUser, id: string, input: IdentityInput) {
    const user = await this.findStudent(id);
    if (!this.manageable(viewer, user)) {
      throw forbidden('Bu o‘quvchining ma’lumotlarini o‘zgartirish vakolatingiz yo‘q.');
    }

    const currentBirthDate = user.birthDate ? isoDateOnly(user.birthDate) : null;
    const next = {
      lastName: input.lastName ?? user.lastName,
      firstName: input.firstName ?? user.firstName,
      middleName: input.middleName === undefined ? user.middleName : input.middleName,
      birthDate: input.birthDate === undefined ? currentBirthDate : input.birthDate,
    };
    const pinflGiven = input.pinfl !== undefined;
    const pinflChanged = pinflGiven && (input.pinfl ? this.vault.hash(input.pinfl) : null) !== user.pinflHash;

    const changed: IdentityField[] = [];
    if (next.lastName !== user.lastName) changed.push('lastName');
    if (next.firstName !== user.firstName) changed.push('firstName');
    if (next.middleName !== user.middleName) changed.push('middleName');
    if (next.birthDate !== currentBirthDate) changed.push('birthDate');
    if (pinflChanged) changed.push('pinfl');
    if (changed.length === 0) return this.toProfile(viewer, user);

    // JSHSHIR tug‘ilgan sanani o‘z ichiga oladi: sana yoki raqam o‘zgarsa, moslik qayta tekshiriladi.
    if (pinflChanged || changed.includes('birthDate')) {
      const pinfl = pinflGiven ? input.pinfl : user.pinflEncrypted ? this.openPinfl(user.pinflEncrypted) : null;
      if (pinfl) {
        const field = pinflChanged ? 'pinfl' : 'birthDate';
        if (!next.birthDate) {
          const message = 'JSHSHIR kiritilgan o‘quvchining tug‘ilgan sanasini ham kiriting.';
          throw badRequest('BIRTH_DATE_REQUIRED', message, [{ path: 'birthDate', message }]);
        }
        const check = checkPinfl(pinfl, next.birthDate);
        if (!check.ok) throw badRequest('PINFL_MISMATCH', check.message, [{ path: field, message: check.message }]);
      }
    }

    const pinflFields = pinflChanged ? this.vault.fields(input.pinfl ?? null) : {};
    if (pinflChanged && input.pinfl) {
      const owner = await this.prisma.user.findUnique({
        where: { pinflHash: this.vault.hash(input.pinfl) },
        select: { id: true },
      });
      if (owner && owner.id !== id) throw this.pinflTaken();
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            lastName: next.lastName,
            firstName: next.firstName,
            middleName: next.middleName,
            searchText: userSearchText({ ...next, login: user.login }),
            ...(changed.includes('birthDate')
              ? {
                  birthDate: next.birthDate ? dateOnly(next.birthDate) : null,
                  birthYear: next.birthDate ? Number(next.birthDate.slice(0, 4)) : null,
                }
              : {}),
            ...pinflFields,
          },
        });
        await this.audit.log('user.identity_updated', { type: 'User', id }, { fields: changed }, { tx });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw this.pinflTaken();
      throw error;
    }
    return this.profile(viewer, id);
  }

  private pinflTaken() {
    const message = 'Bu JSHSHIR boshqa hisobga biriktirilgan. Raqamni hujjatdan qayta tekshiring.';
    return conflict('PINFL_TAKEN', message, [{ path: 'pinfl', message }]);
  }
}
