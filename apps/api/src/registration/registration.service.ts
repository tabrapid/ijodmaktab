import { Injectable } from '@nestjs/common';
import {
  canManageRoles,
  fullName,
  normalizeUzbekName,
  userSearchText,
  type PersonName,
  type Role,
  type UserStatus,
  type registrationListQuerySchema,
  type registrationSettingsSchema,
  type studentRegistrationSchema,
  type teacherRegistrationSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AuthService, type MeResponse } from '../auth/auth.service.js';
import { hashPassword } from '../auth/passwords.js';
import { SessionService, type SessionMeta } from '../auth/session.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { dateOnly, isoDateOnly } from '../common/dates.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { PinflVault } from '../common/pinfl-vault.js';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';

type StudentRegistration = z.output<typeof studentRegistrationSchema>;
type TeacherRegistration = z.output<typeof teacherRegistrationSchema>;
type RegistrationListQuery = z.output<typeof registrationListQuerySchema>;
type RegistrationSettingsInput = z.output<typeof registrationSettingsSchema>;

/** Maktab sozlamalari hali saqlanmagan bo‘lsa ishlatiladigan nom (StructureService bilan bir xil). */
const DEFAULT_SCHOOL_NAME = 'Ijod maktabi';

/** Login yoki parolni unutgan foydalanuvchiga beriladigan maslahat. */
const ASK_DEPUTY = 'Login yoki parolni unutgan bo‘lsangiz, direktor o‘rinbosariga murojaat qiling.';

const PINFL_TAKEN_MESSAGE = `Bu JSHSHIR bilan hisob allaqachon mavjud. ${ASK_DEPUTY}`;

const NOT_PENDING_MESSAGE = 'Bu hisob tasdiq kutayotganlar ro‘yxatida emas (allaqachon tasdiqlangan yoki rad etilgan).';

/** Tasdiq kutayotgan (o‘zi ro‘yxatdan o‘tgan) o‘qituvchilar. */
const PENDING_TEACHERS = {
  status: 'PENDING',
  registrationSource: 'SELF',
  roles: { some: { role: 'TEACHER' } },
} satisfies Prisma.UserWhereInput;

const personSelect = { lastName: true, firstName: true, middleName: true } as const;

const laterOf = (a: Date, b: Date) => (a > b ? a : b);

/**
 * Bitta odammi: familiya va ism (normallashtirilgan holda) bir xil, otasining ismi ikkalasida ham
 * yozilgan bo‘lsa — u ham bir xil. Eski (qo‘lda kiritilgan) yozuvlar ham shu qoida bilan solishtiriladi.
 */
function samePerson(existing: PersonName, input: PersonName) {
  const same = (a: string, b: string) => normalizeUzbekName(a) === normalizeUzbekName(b);
  if (!same(existing.lastName, input.lastName) || !same(existing.firstName, input.firstName)) return false;
  return !existing.middleName || !input.middleName || same(existing.middleName, input.middleName);
}

/**
 * O‘quvchi va o‘qituvchilarning o‘zi ro‘yxatdan o‘tishi (ochiq sahifalar) hamda direktor
 * o‘rinbosarining arizalar bilan ishlashi. JSHSHIR faqat shifrlangan holda saqlanadi va hech
 * qaysi javob, xato yoki audit yozuviga ochiq holda tushmaydi.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly pinfl: PinflVault,
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
  ) {}

  // ------------------------------------------------------------ Sozlamalar

  async settings() {
    const school = await this.prisma.school.findUnique({ where: { id: 1 } });
    return {
      studentRegistrationOpen: school?.studentRegistrationOpen ?? true,
      teacherRegistrationOpen: school?.teacherRegistrationOpen ?? true,
    };
  }

  async updateSettings(input: RegistrationSettingsInput) {
    const before = await this.settings();
    const data = {
      ...(input.studentRegistrationOpen === undefined
        ? {}
        : { studentRegistrationOpen: input.studentRegistrationOpen }),
      ...(input.teacherRegistrationOpen === undefined
        ? {}
        : { teacherRegistrationOpen: input.teacherRegistrationOpen }),
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.school.upsert({ where: { id: 1 }, update: data, create: { id: 1, name: DEFAULT_SCHOOL_NAME, ...data } });
      await this.audit.log(
        'school.registration_settings',
        { type: 'School', id: '1' },
        { before, after: { ...before, ...data } },
        { tx },
      );
    });
    return this.settings();
  }

  private async assertOpen(kind: 'student' | 'teacher') {
    const settings = await this.settings();
    const open = kind === 'student' ? settings.studentRegistrationOpen : settings.teacherRegistrationOpen;
    if (open) return;
    throw forbidden(
      kind === 'student'
        ? 'O‘quvchilar uchun ro‘yxatdan o‘tish hozircha yopiq. Direktor o‘rinbosariga murojaat qiling.'
        : 'O‘qituvchilar uchun ro‘yxatdan o‘tish hozircha yopiq. Direktor o‘rinbosariga murojaat qiling.',
      'REGISTRATION_CLOSED',
    );
  }

  // ------------------------------------------------------------ Ochiq sahifalar

  /** Ro‘yxatdan o‘tish sahifasi uchun: joriy o‘quv yili sinflari (11 → 7) va faol fanlar. */
  async options() {
    const school = await this.prisma.school.findUnique({ where: { id: 1 } });
    const studentOpen = school?.studentRegistrationOpen ?? true;
    const teacherOpen = school?.teacherRegistrationOpen ?? true;
    const [classes, subjects] = await Promise.all([
      studentOpen
        ? this.prisma.class.findMany({
            where: { archivedAt: null, academicYear: { isCurrent: true } },
            orderBy: [{ gradeLevel: 'desc' }, { section: 'asc' }, { name: 'asc' }],
            select: { id: true, name: true, gradeLevel: true, section: true },
          })
        : [],
      teacherOpen
        ? this.prisma.subject.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
          })
        : [],
    ]);
    return {
      school: { name: school?.name ?? DEFAULT_SCHOOL_NAME },
      student: { open: studentOpen, classes },
      teacher: { open: teacherOpen, subjects },
    };
  }

  async loginAvailability(login: string): Promise<{ available: boolean; suggestion?: string }> {
    const taken = await this.prisma.user.findUnique({ where: { login }, select: { id: true } });
    if (!taken) return { available: true };
    return { available: false, suggestion: await this.suggestLogin(login) };
  }

  /** Band login o‘rniga bo‘sh variant: “ali.valiyev” → “ali.valiyev2”, “ali.valiyev2” → “ali.valiyev3”. */
  private async suggestLogin(login: string) {
    const trimmed = login.replace(/\d+$/, '');
    const stem = trimmed.length >= 3 ? trimmed : login;
    const existing = await this.prisma.user.findMany({
      where: { login: { startsWith: stem.slice(0, 44) } },
      select: { login: true },
    });
    const taken = new Set(existing.map((item) => item.login));
    if (stem !== login && !taken.has(stem)) return stem;
    for (let index = 2; ; index += 1) {
      const tail = String(index);
      // Login 50 belgidan oshmasin.
      const candidate = `${stem.slice(0, 50 - tail.length)}${tail}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  private async assertLoginFree(login: string) {
    const existing = await this.prisma.user.findUnique({ where: { login }, select: { id: true } });
    if (existing) {
      throw conflict('LOGIN_TAKEN', `“${login}” logini band. Boshqa login tanlang.`, {
        suggestion: await this.suggestLogin(login),
      });
    }
  }

  /** Bir xil login yoki JSHSHIR bir vaqtda yuborilsa, bazaning noyoblik xatosi tushunarli xabarga aylanadi. */
  private async mapUniqueViolation(error: unknown, login: string, pinflHash: string | null): Promise<never> {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      await this.assertLoginFree(login);
      if (pinflHash && (await this.prisma.user.count({ where: { pinflHash } }))) {
        throw conflict('PINFL_TAKEN', PINFL_TAKEN_MESSAGE);
      }
    }
    throw error;
  }

  /**
   * O‘quvchi o‘zi ro‘yxatdan o‘tadi: hisob darhol faol, tanlangan sinfga biriktiriladi va
   * foydalanuvchi shu zahoti tizimga kiritiladi (sessiya tokeni qaytariladi).
   */
  async registerStudent(input: StudentRegistration, meta: SessionMeta): Promise<{ token: string; me: MeResponse }> {
    await this.assertOpen('student');

    const schoolClass = await this.prisma.class.findFirst({
      where: { id: input.classId, archivedAt: null, academicYear: { isCurrent: true } },
      include: { academicYear: { select: { startsOn: true } } },
    });
    if (!schoolClass) {
      const message = 'Tanlangan sinf topilmadi yoki joriy o‘quv yiliga tegishli emas. Sinfni qaytadan tanlang.';
      throw badRequest('INVALID_CLASS', message, [{ path: 'classId', message }]);
    }

    await this.assertLoginFree(input.login);
    const pinfl = this.pinfl.fields(input.pinfl);
    if (pinfl.pinflHash && (await this.prisma.user.count({ where: { pinflHash: pinfl.pinflHash } }))) {
      throw conflict('PINFL_TAKEN', PINFL_TAKEN_MESSAGE);
    }

    const birthDate = dateOnly(input.birthDate);
    const namesakes = await this.prisma.user.findMany({
      where: { birthDate, status: { in: ['ACTIVE', 'PENDING'] }, roles: { some: { role: 'STUDENT' } } },
      select: personSelect,
    });
    if (namesakes.some((person) => samePerson(person, input))) {
      throw conflict(
        'DUPLICATE_PERSON',
        `Shu ism-familiya va tug‘ilgan sana bilan o‘quvchi allaqachon ro‘yxatdan o‘tgan. ${ASK_DEPUTY}`,
      );
    }

    const passwordHash = await hashPassword(input.password);
    const names = { lastName: input.lastName, firstName: input.firstName, middleName: input.middleName };
    const now = new Date();

    let user: { id: string; internalId: number; login: string };
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            login: input.login,
            passwordHash,
            mustChangePassword: false,
            passwordChangedAt: now,
            ...names,
            searchText: userSearchText({ ...names, login: input.login }),
            status: 'ACTIVE',
            registrationSource: 'SELF',
            birthDate,
            birthYear: Number(input.birthDate.slice(0, 4)),
            ...pinfl,
            roles: { create: [{ role: 'STUDENT' }] },
          },
          select: { id: true, internalId: true, login: true },
        });
        await tx.enrollment.create({
          data: {
            studentId: created.id,
            classId: schoolClass.id,
            academicYearId: schoolClass.academicYearId,
            startsOn: laterOf(dateOnly(), schoolClass.academicYear.startsOn),
          },
        });
        // JSHSHIR audit yozuviga tushmaydi.
        await this.audit.log(
          'user.registered',
          { type: 'User', id: created.id },
          { role: 'STUDENT', login: created.login, classId: schoolClass.id },
          { tx, actor: { id: created.id, roles: ['STUDENT'] } },
        );
        return created;
      });
    } catch (error) {
      return this.mapUniqueViolation(error, input.login, pinfl.pinflHash);
    }

    return this.startSession({ ...user, ...names }, meta);
  }

  /** Ro‘yxatdan o‘tgan o‘quvchi uchun `/auth/login` bilan bir xil sessiya (SCHOOL). */
  private async startSession(
    user: { id: string; internalId: number; login: string } & Required<PersonName>,
    meta: SessionMeta,
  ): Promise<{ token: string; me: MeResponse }> {
    const roles: Role[] = ['STUDENT'];
    const now = new Date();
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now, lastActiveAt: now } });
    const { token, session } = await this.sessions.create(user.id, 'SCHOOL', meta);
    await this.audit.log(
      'auth.login',
      { type: 'User', id: user.id },
      { realm: 'SCHOOL', sessionId: session.id, via: 'registration' },
      { actor: { id: user.id, roles } },
    );
    const authUser: AuthUser = {
      id: user.id,
      internalId: user.internalId,
      login: user.login,
      lastName: user.lastName,
      firstName: user.firstName,
      middleName: user.middleName,
      roles,
      sessionId: session.id,
      realm: 'SCHOOL',
      mustChangePassword: false,
      mfaEnabled: false,
      mfaVerified: false,
      avatarFileId: null,
    };
    return { token, me: await this.auth.me(authUser) };
  }

  /**
   * O‘qituvchi ariza qoldiradi: hisob direktor o‘rinbosari tasdiqlaguncha “tasdiq kutilmoqda”
   * holatida bo‘ladi (o‘qituvchi maktab test bankini javob kalitlari bilan ko‘radi).
   */
  async registerTeacher(input: TeacherRegistration): Promise<{ status: 'PENDING' }> {
    await this.assertOpen('teacher');

    const subject = await this.prisma.subject.findFirst({
      where: { id: input.specialtySubjectId, isActive: true },
      select: { id: true, name: true },
    });
    if (!subject) {
      const message = 'Tanlangan fan topilmadi. Fanni qaytadan tanlang.';
      throw badRequest('INVALID_SUBJECT', message, [{ path: 'specialtySubjectId', message }]);
    }

    await this.assertLoginFree(input.login);
    const namesakes = await this.prisma.user.findMany({
      where: {
        birthYear: input.birthYear,
        status: { in: ['ACTIVE', 'PENDING'] },
        roles: { some: { role: 'TEACHER' } },
      },
      select: personSelect,
    });
    if (namesakes.some((person) => samePerson(person, input))) {
      throw conflict(
        'DUPLICATE_PERSON',
        `Shu ism-familiya va tug‘ilgan yil bilan o‘qituvchi allaqachon ro‘yxatdan o‘tgan yoki arizasi tasdiq kutmoqda. ${ASK_DEPUTY}`,
      );
    }

    const passwordHash = await hashPassword(input.password);
    const names = { lastName: input.lastName, firstName: input.firstName, middleName: input.middleName };
    const deputies = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: 'DEPUTY' } } },
      select: { id: true },
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            login: input.login,
            passwordHash,
            mustChangePassword: false,
            passwordChangedAt: new Date(),
            ...names,
            searchText: userSearchText({ ...names, login: input.login }),
            status: 'PENDING',
            registrationSource: 'SELF',
            birthYear: input.birthYear,
            specialtySubjectId: subject.id,
            roles: { create: [{ role: 'TEACHER' }] },
          },
          select: { id: true, login: true },
        });
        // Muallif ko‘rsatilmaydi: ariza rad etilsa, hisobni o‘chirish mumkin bo‘lishi kerak
        // (audit yozuvi muallifi bo‘lgan hisob o‘chirilmaydi).
        await this.audit.log(
          'user.registered',
          { type: 'User', id: created.id },
          { role: 'TEACHER', login: created.login, specialtySubjectId: subject.id },
          { tx, actor: null },
        );
        await this.notifications.notify(
          deputies.map((deputy) => deputy.id),
          {
            type: 'REGISTRATION_PENDING',
            title: `Yangi o‘qituvchi ro‘yxatdan o‘tdi: ${fullName(names)}`,
            body: subject.name,
            link: '/management/registrations',
          },
          tx,
        );
      });
    } catch (error) {
      return this.mapUniqueViolation(error, input.login, null);
    }
    return { status: 'PENDING' };
  }

  // ------------------------------------------------------------ Direktor o‘rinbosari

  async list(viewer: AuthUser, query: RegistrationListQuery) {
    const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
    const pending = await this.prisma.user.count({ where: PENDING_TEACHERS });
    const counts = { pending };
    const orderBy: Prisma.UserOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { internalId: 'desc' }];
    // Login faqat boshqara oladigan hisoblarda ko‘rsatiladi (foydalanuvchilar bo‘limidagi qoida).
    const credentials = (id: string, roles: { role: string }[], login: string) => {
      const manageable =
        id !== viewer.id &&
        canManageRoles(
          viewer.roles,
          roles.map((item) => item.role as Role),
        );
      return { manageable, login: manageable ? login : null };
    };

    if (query.view === 'students') {
      const where: Prisma.UserWhereInput = {
        registrationSource: 'SELF',
        roles: { some: { role: 'STUDENT' } },
        createdAt: { gte: since },
      };
      const [rows, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          orderBy,
          ...pageArgs(query),
          select: {
            id: true,
            ...personSelect,
            login: true,
            status: true,
            birthDate: true,
            pinflHash: true,
            createdAt: true,
            roles: { select: { role: true } },
            enrollments: {
              where: { endsOn: null, academicYear: { isCurrent: true } },
              select: { class: { select: { id: true, name: true } } },
              take: 1,
            },
          },
        }),
        this.prisma.user.count({ where }),
      ]);
      const items = rows.map((row) => ({
        id: row.id,
        fullName: fullName(row),
        classId: row.enrollments[0]?.class.id ?? null,
        className: row.enrollments[0]?.class.name ?? null,
        birthDate: row.birthDate ? isoDateOnly(row.birthDate) : null,
        // JSHSHIRning o‘zi emas, faqat kiritilgan-kiritilmagani.
        hasPinfl: row.pinflHash !== null,
        status: row.status as UserStatus,
        createdAt: row.createdAt,
        ...credentials(row.id, row.roles, row.login),
      }));
      return { ...toPage(items, total, query), counts };
    }

    const where: Prisma.UserWhereInput =
      query.view === 'pending'
        ? PENDING_TEACHERS
        : { registrationSource: 'SELF', roles: { some: { role: 'TEACHER' } }, createdAt: { gte: since } };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        ...pageArgs(query),
        select: {
          id: true,
          ...personSelect,
          login: true,
          status: true,
          birthYear: true,
          createdAt: true,
          approvedAt: true,
          roles: { select: { role: true } },
          specialtySubject: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, ...personSelect } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      fullName: fullName(row),
      birthYear: row.birthYear,
      specialtySubject: row.specialtySubject,
      status: row.status as UserStatus,
      createdAt: row.createdAt,
      approvedAt: row.approvedAt,
      approvedBy: row.approvedBy ? { id: row.approvedBy.id, fullName: fullName(row.approvedBy) } : null,
      ...credentials(row.id, row.roles, row.login),
    }));
    return { ...toPage(items, total, query), counts };
  }

  /** Tasdiq kutayotgan hisob (topilmasa 404, tasdiq kutmayotgan bo‘lsa 409). */
  private async pendingAccount(viewer: AuthUser, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { select: { role: true } } },
    });
    if (!user) throw notFound('Foydalanuvchi');
    const roles = user.roles.map((item) => item.role as Role);
    if (user.status !== 'PENDING' || user.registrationSource !== 'SELF' || !roles.includes('TEACHER')) {
      throw conflict('NOT_PENDING', NOT_PENDING_MESSAGE);
    }
    if (!canManageRoles(viewer.roles, roles)) {
      throw forbidden('Direktor o‘rinbosari faqat o‘qituvchi va o‘quvchi hisoblarini boshqara oladi.');
    }
    return user;
  }

  /** O‘qituvchi hisobini tasdiqlash: hisob faollashadi, o‘qituvchiga bildirishnoma yuboriladi. */
  async approve(viewer: AuthUser, userId: string) {
    const user = await this.pendingAccount(viewer, userId);
    const approvedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, status: 'PENDING' },
        data: { status: 'ACTIVE', statusReason: null, approvedAt, approvedById: viewer.id },
      });
      if (updated.count === 0) throw conflict('NOT_PENDING', NOT_PENDING_MESSAGE);
      await this.audit.log(
        'user.registration_approved',
        { type: 'User', id: userId },
        { login: user.login, fullName: fullName(user) },
        { tx },
      );
      await this.notifyApproved(tx, userId);
    });
    return { id: userId, status: 'ACTIVE' as const, approvedAt };
  }

  private notifyApproved(tx: Tx, userId: string) {
    return this.notifications.notify(
      [userId],
      {
        type: 'ACCOUNT_APPROVED',
        title: 'Hisobingiz tasdiqlandi',
        body: 'Direktor o‘rinbosari hisobingizni tasdiqladi. Endi tizimdan to‘liq foydalanishingiz mumkin.',
        link: '/teacher',
      },
      tx,
    );
  }

  /**
   * Arizani rad etish: hisobning hech qanday tarixi yo‘q, shuning uchun u butunlay o‘chiriladi.
   * Audit yozuvi (login, F.I.Sh., sabab) saqlanib qoladi — `user.delete` kabi.
   */
  async reject(viewer: AuthUser, userId: string, reason: string | null) {
    const user = await this.pendingAccount(viewer, userId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const removed = await tx.user.deleteMany({
          where: { id: userId, status: 'PENDING', registrationSource: 'SELF' },
        });
        if (removed.count === 0) throw conflict('NOT_PENDING', NOT_PENDING_MESSAGE);
        await this.audit.log(
          'user.registration_rejected',
          { type: 'User', id: userId },
          { login: user.login, fullName: fullName(user), role: 'TEACHER', reason },
          { tx },
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2014'].includes(error.code)) {
        throw conflict(
          'HAS_HISTORY',
          'Hisob boshqa ma’lumotlar bilan bog‘langan, shuning uchun uni o‘chirib bo‘lmaydi. Uning o‘rniga hisobni faolsizlantiring.',
        );
      }
      throw error;
    }
    return { ok: true };
  }
}
