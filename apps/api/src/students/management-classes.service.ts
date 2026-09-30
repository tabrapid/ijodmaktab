import { Injectable } from '@nestjs/common';
import { NEW_STUDENT_CLASS_DAYS, fullName, type RegistrationSource, type UserStatus } from '@ijod/shared';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import { avatarUrlOf } from '../common/auth-user.js';
import { isoDateOnly } from '../common/dates.js';
import { badRequest, conflict, notFound } from '../common/errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLASS_ORDER, daysAgo, emptyCounts, personSelect, personView, portfolioCounts } from './student-views.js';

const cardSelect = {
  id: true,
  name: true,
  gradeLevel: true,
  section: true,
  homeroomTeacher: { select: personSelect },
  _count: { select: { enrollments: { where: { endsOn: null } } } },
} satisfies Prisma.ClassSelect;

type CardSource = Prisma.ClassGetPayload<{ select: typeof cardSelect }>;

function cardOf(item: CardSource, newStudentCount: number) {
  return {
    id: item.id,
    name: item.name,
    gradeLevel: item.gradeLevel,
    section: item.section,
    studentCount: item._count.enrollments,
    newStudentCount,
    homeroomTeacher: personView(item.homeroomTeacher),
  };
}

export type ClassCard = ReturnType<typeof cardOf>;

/** Rahbariyatning “Sinflar” ko‘rinishi: joriy o‘quv yili sinflari, sinf rahbari va o‘quvchilar. */
@Injectable()
export class ManagementClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Joriy o‘quv yilining arxivlanmagan sinflari: 11-sinfdan 7-sinfgacha. */
  async list() {
    const year = await this.access.currentYear();
    if (!year) return [];
    return this.cards({ academicYearId: year.id, archivedAt: null });
  }

  private async cards(where: Prisma.ClassWhereInput): Promise<ClassCard[]> {
    const classes = await this.prisma.class.findMany({ where, orderBy: CLASS_ORDER, select: cardSelect });
    const fresh = await this.newStudentCounts(classes.map((item) => item.id));
    return classes.map((item) => cardOf(item, fresh.get(item.id) ?? 0));
  }

  /** So‘nggi kunlarda o‘zi ro‘yxatdan o‘tib, sinfda turgan o‘quvchilar soni — bitta guruhlangan so‘rov. */
  private async newStudentCounts(classIds: string[]) {
    const result = new Map<string, number>();
    if (classIds.length === 0) return result;
    const grouped = await this.prisma.enrollment.groupBy({
      by: ['classId'],
      where: {
        classId: { in: classIds },
        endsOn: null,
        student: { registrationSource: 'SELF', createdAt: { gte: daysAgo(NEW_STUDENT_CLASS_DAYS) } },
      },
      _count: { _all: true },
    });
    for (const row of grouped) result.set(row.classId, row._count._all);
    return result;
  }

  /** Sinf sarlavhasi va undagi o‘quvchilar (faol a’zolik bo‘yicha, ism tartibida). */
  async detail(id: string) {
    const item = await this.prisma.class.findUnique({
      where: { id },
      select: {
        ...cardSelect,
        archivedAt: true,
        academicYear: { select: { id: true, name: true, isCurrent: true } },
        enrollments: {
          where: { endsOn: null },
          orderBy: [
            { student: { lastName: 'asc' } },
            { student: { firstName: 'asc' } },
            { student: { middleName: 'asc' } },
          ],
          select: {
            student: {
              select: {
                ...personSelect,
                login: true,
                status: true,
                registrationSource: true,
                createdAt: true,
                birthDate: true,
              },
            },
          },
        },
      },
    });
    if (!item) throw notFound('Sinf');

    const students = item.enrollments.map((enrollment) => enrollment.student);
    const counts = await portfolioCounts(
      this.prisma,
      students.map((student) => student.id),
    );
    const since = daysAgo(NEW_STUDENT_CLASS_DAYS);
    const newStudentCount = students.filter(
      (student) => student.registrationSource === 'SELF' && student.createdAt >= since,
    ).length;

    return {
      ...cardOf(item, newStudentCount),
      academicYear: item.academicYear,
      archivedAt: item.archivedAt,
      students: students.map((student) => ({
        id: student.id,
        fullName: fullName(student),
        avatarUrl: avatarUrlOf(student.avatarFileId),
        login: student.login,
        status: student.status as UserStatus,
        registrationSource: student.registrationSource as RegistrationSource,
        createdAt: student.createdAt,
        birthDate: student.birthDate ? isoDateOnly(student.birthDate) : null,
        portfolio: counts.get(student.id) ?? emptyCounts(),
      })),
    };
  }

  /**
   * Sinf rahbarini tayinlash, almashtirish yoki olib tashlash (`null`). Faqat joriy o‘quv yilining
   * arxivlanmagan sinfi uchun; rahbar — faol o‘qituvchi. Yangi rahbarga bildirishnoma yuboriladi.
   * O‘qituvchi boshqa sinflarga ham rahbar bo‘lishi mumkin — javobda ular ko‘rsatiladi.
   */
  async assignHomeroom(classId: string, teacherId: string | null) {
    const target = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { academicYear: true, homeroomTeacher: { select: personSelect } },
    });
    if (!target) throw notFound('Sinf');
    if (target.archivedAt) {
      throw conflict('CLASS_ARCHIVED', 'Sinf arxivlangan — sinf rahbarini o‘zgartirib bo‘lmaydi.');
    }
    if (!target.academicYear.isCurrent) {
      throw conflict('NOT_CURRENT_YEAR', 'Sinf rahbari faqat joriy o‘quv yili sinflariga tayinlanadi.');
    }

    const teacher = teacherId
      ? await this.prisma.user.findFirst({
          where: { id: teacherId, status: 'ACTIVE', roles: { some: { role: 'TEACHER' } } },
          select: personSelect,
        })
      : null;
    if (teacherId && !teacher) {
      const message = 'Tanlangan foydalanuvchi faol o‘qituvchi emas. Ro‘yxatdan faol o‘qituvchini tanlang.';
      throw badRequest('NOT_A_TEACHER', message, [{ path: 'teacherId', message }]);
    }

    if (target.homeroomTeacherId !== teacherId) {
      const before = target.homeroomTeacher ? { id: target.homeroomTeacher.id, name: fullName(target.homeroomTeacher) } : null;
      const after = teacher ? { id: teacher.id, name: fullName(teacher) } : null;
      await this.prisma.$transaction(async (tx) => {
        // Shu orada sinf arxivlangan bo‘lsa, o‘zgarish yozilmaydi.
        const updated = await tx.class.updateMany({
          where: { id: classId, archivedAt: null },
          data: { homeroomTeacherId: teacherId },
        });
        if (updated.count === 0) {
          throw conflict('CLASS_ARCHIVED', 'Sinf arxivlangan — sinf rahbarini o‘zgartirib bo‘lmaydi.');
        }
        await this.audit.log(
          'class.homeroom_changed',
          { type: 'Class', id: classId },
          { className: target.name, academicYear: target.academicYear.name, before, after },
          { tx },
        );
        if (teacher) {
          await this.notifications.notify(
            [teacher.id],
            {
              type: 'HOMEROOM_ASSIGNED',
              title: `Siz ${target.name} sinf rahbari etib tayinlandingiz`,
              body: `${target.academicYear.name} o‘quv yili. Sinf o‘quvchilari ro‘yxati, natijalari va portfoliolarini tasdiqlash “Sinflarim” bo‘limida.`,
              link: `/teacher/classes/${classId}`,
            },
            tx,
          );
        }
      });
    }

    const [card] = await this.cards({ id: classId });
    const alsoHomeroomOf = teacherId
      ? await this.prisma.class.findMany({
          where: {
            homeroomTeacherId: teacherId,
            id: { not: classId },
            archivedAt: null,
            academicYear: { isCurrent: true },
          },
          orderBy: CLASS_ORDER,
          select: { id: true, name: true },
        })
      : [];
    return { ...card!, alsoHomeroomOf };
  }
}
