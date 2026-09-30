import { HttpStatus, Injectable } from '@nestjs/common';
import {
  PORTFOLIO_ITEM_TYPES,
  certificateMatchesSpecialty,
  fullName,
  mentorshipKindOf,
  normalizeForSearch,
  type PortfolioItemType,
} from '@ijod/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { AppError, badRequest, notFound } from '../common/errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  certificateBrief,
  mentorshipInclude,
  mentorshipView,
  studentRef,
  studentSelect,
  type MentorshipView,
} from './teacher-reference.view.js';

/** Ustozlik qayd etiladigan o‘quvchi sertifikatlari: milliy sertifikat, IELTS, SAT, CEFR. */
const MENTORSHIP_ITEM_TYPES = PORTFOLIO_ITEM_TYPES.filter((type) => mentorshipKindOf(type) !== null);

/**
 * Ustozlik uchun ko‘rinadigan sertifikat: tasdiqlangan va o‘quvchi uni “maktab xodimlari” uchun ochiq
 * qoldirgan (faqat o‘zi va tekshiruvchiga ko‘rinadigan yozuv boshqa o‘qituvchilarga ko‘rsatilmaydi).
 */
const ELIGIBLE_ITEM = {
  status: 'APPROVED',
  visibility: 'STAFF',
  type: { in: MENTORSHIP_ITEM_TYPES },
} satisfies Prisma.PortfolioItemWhereInput;

/** O‘quvchi qidiruvida ko‘rib chiqiladigan yozuvlar (natijada ko‘pi bilan 20 ta). */
const SEARCH_SCAN = 100;
const SEARCH_LIMIT = 20;

/** Bildirishnoma sarlavhasi uchun qisqartirish. */
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

export const specialtyRequired = () =>
  badRequest('SPECIALTY_REQUIRED', 'Avval ma’lumotnomada mutaxassislik faningizni belgilang.');

const certificateNotFound = () =>
  new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Sertifikat topilmadi yoki u hozir tasdiqlangan holatda emas.');

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * O‘qituvchining o‘quvchi sertifikatlariga ustozligi (ma’lumotnomaning 10–11-bandlari). Ustozlik bir
 * tugma bilan, tekshiruvsiz qayd etiladi — barcha shartlar serverda qayta tekshiriladi.
 */
@Injectable()
export class MentorshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** O‘qituvchining ustozliklari: milliy va xalqaro sertifikatlar bo‘yicha. */
  async listFor(teacherId: string) {
    const rows = await this.prisma.teacherMentorship.findMany({
      where: { teacherId },
      include: mentorshipInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const views = rows.map(mentorshipView);
    return {
      national: views.filter((view) => view.kind === 'NATIONAL'),
      international: views.filter((view) => view.kind === 'INTERNATIONAL'),
    };
  }

  /** O‘qituvchi va uning mutaxassislik fani (belgilanmagan bo‘lsa — 400 SPECIALTY_REQUIRED). */
  private async teacherWithSpecialty(teacherId: string) {
    const teacher = await this.prisma.user.findUnique({
      where: { id: teacherId },
      select: {
        lastName: true,
        firstName: true,
        middleName: true,
        specialtySubject: { select: { id: true, name: true } },
      },
    });
    if (!teacher?.specialtySubject) throw specialtyRequired();
    return { teacher, specialty: teacher.specialtySubject };
  }

  /**
   * Faol o‘quvchilarni (istalgan sinf) ism-familiyasi bo‘yicha qidirish. Faqat ism, sinf va profil rasmi
   * qaytadi; qidiruv faqat F.I.Sh. bo‘yicha — login orqali moslik hisobga olinmaydi.
   */
  async searchStudents(viewer: AuthUser, q: string) {
    const tokens = normalizeForSearch(q).split(' ').filter(Boolean);
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        id: { not: viewer.id },
        roles: { some: { role: 'STUDENT' } },
        AND: tokens.map((token) => ({ searchText: { contains: token } })),
      },
      select: studentSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { middleName: 'asc' }, { id: 'asc' }],
      take: SEARCH_SCAN,
    });
    return users
      .filter((user) => {
        const name = normalizeForSearch(fullName(user));
        return tokens.every((token) => name.includes(token));
      })
      .slice(0, SEARCH_LIMIT)
      .map(studentRef);
  }

  /**
   * Tanlangan o‘quvchining mutaxassislikka mos, tasdiqlangan sertifikatlari. Faqat qisqa ma’lumot:
   * turi, nomi, natijasi va sanasi (dalil fayllari va boshqa yozuvlar ko‘rsatilmaydi).
   */
  async candidates(viewer: AuthUser, studentId: string) {
    const { specialty } = await this.teacherWithSpecialty(viewer.id);
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, status: 'ACTIVE', roles: { some: { role: 'STUDENT' } }, NOT: { id: viewer.id } },
      select: studentSelect,
    });
    if (!student) throw notFound('O‘quvchi');
    const items = await this.prisma.portfolioItem.findMany({
      where: { ownerId: studentId, ...ELIGIBLE_ITEM },
      select: {
        id: true,
        type: true,
        title: true,
        details: true,
        result: true,
        date: true,
        mentorships: { where: { teacherId: viewer.id }, select: { id: true } },
      },
      orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    const matching = items
      .filter((item) => certificateMatchesSpecialty(item.type as PortfolioItemType, item.details, specialty.name))
      .map((item) => {
        const { id, ...brief } = certificateBrief(item);
        return {
          kind: mentorshipKindOf(item.type as PortfolioItemType),
          candidate: { portfolioItemId: id, ...brief, claimed: item.mentorships.length > 0 },
        };
      });
    return {
      student: studentRef(student),
      specialty,
      national: matching.filter((entry) => entry.kind === 'NATIONAL').map((entry) => entry.candidate),
      international: matching.filter((entry) => entry.kind === 'INTERNATIONAL').map((entry) => entry.candidate),
    };
  }

  private async findOwn(teacherId: string, portfolioItemId: string) {
    return this.prisma.teacherMentorship.findUnique({
      where: { teacherId_portfolioItemId: { teacherId, portfolioItemId } },
      include: mentorshipInclude,
    });
  }

  /**
   * “Ustozlik qildim”: tekshiruvsiz darhol qayd etiladi. Shartlar qayta tekshiriladi: mutaxassislik
   * belgilangan, sertifikat tasdiqlangan va xodimlarga ochiq, egasi faol o‘quvchi, turi mos va fani
   * mutaxassislikka to‘g‘ri keladi. Takroriy so‘rov mavjud yozuvni qaytaradi (yangi xabar yuborilmaydi).
   */
  async create(viewer: AuthUser, portfolioItemId: string): Promise<{ created: boolean; mentorship: MentorshipView }> {
    const { teacher, specialty } = await this.teacherWithSpecialty(viewer.id);
    const item = await this.prisma.portfolioItem.findUnique({
      where: { id: portfolioItemId },
      select: {
        id: true,
        ownerId: true,
        type: true,
        status: true,
        visibility: true,
        title: true,
        details: true,
        owner: { select: { status: true, roles: { select: { role: true } } } },
      },
    });
    const kind = item ? mentorshipKindOf(item.type as PortfolioItemType) : null;
    const eligible =
      item !== null &&
      kind !== null &&
      item.ownerId !== viewer.id &&
      item.status === ELIGIBLE_ITEM.status &&
      item.visibility === ELIGIBLE_ITEM.visibility &&
      item.owner.status === 'ACTIVE' &&
      item.owner.roles.some((entry) => entry.role === 'STUDENT');
    if (!item || !kind || !eligible) throw certificateNotFound();
    if (!certificateMatchesSpecialty(item.type as PortfolioItemType, item.details, specialty.name)) {
      throw badRequest(
        'SUBJECT_MISMATCH',
        `Bu sertifikat mutaxassislik faningiz (${specialty.name}) bo‘yicha emas — unga ustozlik qayd etilmaydi.`,
      );
    }

    const existing = await this.findOwn(viewer.id, item.id);
    if (existing) return { created: false, mentorship: mentorshipView(existing) };
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.teacherMentorship.create({
          data: { teacherId: viewer.id, portfolioItemId: item.id, kind },
          include: mentorshipInclude,
        });
        await this.notifications.notify(
          [item.ownerId],
          {
            type: 'MENTORSHIP_ADDED',
            title: `${fullName(teacher)} sizning “${clip(item.title, 120)}” sertifikatingiz bo‘yicha ustozingiz sifatida qayd etildi`,
            link: `/portfolio/${item.id}`,
          },
          tx,
        );
        await this.audit.log(
          'teacher.mentorship_added',
          { type: 'TeacherMentorship', id: row.id },
          { portfolioItemId: item.id, studentId: item.ownerId, kind },
          { tx },
        );
        return row;
      });
      return { created: true, mentorship: mentorshipView(created) };
    } catch (error) {
      // Bir vaqtdagi ikkinchi bosish: yozuv allaqachon yaratilgan.
      if (isUniqueViolation(error)) {
        const again = await this.findOwn(viewer.id, item.id);
        if (again) return { created: false, mentorship: mentorshipView(again) };
      }
      throw error;
    }
  }

  /** O‘z ustozlik yozuvini olib tashlash. */
  async remove(viewer: AuthUser, id: string) {
    const row = await this.prisma.teacherMentorship.findUnique({
      where: { id },
      select: { teacherId: true, portfolioItemId: true, kind: true },
    });
    if (!row || row.teacherId !== viewer.id) throw notFound('Ustozlik yozuvi');
    await this.prisma.$transaction(async (tx) => {
      await tx.teacherMentorship.delete({ where: { id } });
      await this.audit.log(
        'teacher.mentorship_removed',
        { type: 'TeacherMentorship', id },
        { portfolioItemId: row.portfolioItemId, kind: row.kind },
        { tx },
      );
    });
    return { ok: true };
  }
}
