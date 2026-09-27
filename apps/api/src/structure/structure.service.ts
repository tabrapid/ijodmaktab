import { Injectable } from '@nestjs/common';
import {
  fullName,
  type academicYearSchema,
  type classSchema,
  type endEnrollmentSchema,
  type enrollStudentsSchema,
  type schoolSettingsSchema,
  type subjectSchema,
  type teachingAssignmentSchema,
  type transferStudentSchema,
  type updateClassSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole } from '../common/auth-user.js';
import { dateOnly } from '../common/dates.js';
import { badRequest, conflict, notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Out<T extends z.ZodType> = z.output<T>;

@Injectable()
export class StructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ Maktab

  async school() {
    const school = await this.prisma.school.findUnique({ where: { id: 1 } });
    return school ?? { id: 1, name: 'Ijod maktabi', shortName: null, timeZone: 'Asia/Tashkent' };
  }

  async updateSchool(input: Out<typeof schoolSettingsSchema>) {
    const school = await this.prisma.school.upsert({
      where: { id: 1 },
      update: input,
      create: { id: 1, ...input },
    });
    await this.audit.log('school.update', { type: 'School', id: '1' }, input);
    return school;
  }

  // ------------------------------------------------------------ O‘quv yillari

  listYears() {
    return this.prisma.academicYear.findMany({
      orderBy: { startsOn: 'desc' },
      include: { _count: { select: { classes: true } } },
    });
  }

  async createYear(input: Out<typeof academicYearSchema>) {
    const year = await this.prisma.$transaction(async (tx) => {
      if (input.isCurrent) await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const created = await tx.academicYear.create({
        data: {
          name: input.name,
          startsOn: dateOnly(input.startsOn),
          endsOn: dateOnly(input.endsOn),
          isCurrent: input.isCurrent,
        },
      });
      await this.audit.log('academic_year.create', { type: 'AcademicYear', id: created.id }, input, { tx });
      return created;
    });
    return year;
  }

  async updateYear(id: string, input: Out<typeof academicYearSchema>) {
    await this.findYear(id);
    return this.prisma.$transaction(async (tx) => {
      if (input.isCurrent) {
        await tx.academicYear.updateMany({ where: { isCurrent: true, id: { not: id } }, data: { isCurrent: false } });
      }
      const updated = await tx.academicYear.update({
        where: { id },
        data: {
          name: input.name,
          startsOn: dateOnly(input.startsOn),
          endsOn: dateOnly(input.endsOn),
          isCurrent: input.isCurrent,
        },
      });
      await this.audit.log('academic_year.update', { type: 'AcademicYear', id }, input, { tx });
      return updated;
    });
  }

  async makeCurrentYear(id: string) {
    await this.findYear(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const year = await tx.academicYear.update({ where: { id }, data: { isCurrent: true } });
      await this.audit.log('academic_year.make_current', { type: 'AcademicYear', id }, { name: year.name }, { tx });
      return year;
    });
  }

  private async findYear(id: string) {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year) throw notFound('O‘quv yili');
    return year;
  }

  // ------------------------------------------------------------ Fanlar

  listSubjects(includeInactive: boolean) {
    return this.prisma.subject.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createSubject(input: Out<typeof subjectSchema>) {
    const subject = await this.prisma.subject.create({ data: input });
    await this.audit.log('subject.create', { type: 'Subject', id: subject.id }, input);
    return subject;
  }

  async updateSubject(id: string, input: Out<typeof subjectSchema>) {
    const subject = await this.prisma.subject.update({ where: { id }, data: input });
    await this.audit.log('subject.update', { type: 'Subject', id }, input);
    return subject;
  }

  // ------------------------------------------------------------ Sinflar

  /**
   * Sinflar ro‘yxati. O‘qituvchi `scope=mine` bilan faqat o‘z sinflarini ko‘radi;
   * rahbariyat va administrator — barcha sinflarni.
   */
  async listClasses(viewer: AuthUser, options: { academicYearId?: string; scope: 'mine' | 'all' }) {
    const yearId = options.academicYearId ?? (await this.access.currentYear())?.id;
    if (!yearId) return [];
    const onlyMine = options.scope === 'mine' || !this.access.seesAllStudents(viewer);
    const mineIds = onlyMine ? await this.access.teacherClassIds(viewer.id) : null;

    const classes = await this.prisma.class.findMany({
      where: { academicYearId: yearId, id: mineIds ? { in: mineIds } : undefined },
      orderBy: [{ gradeLevel: 'asc' }, { section: 'asc' }],
      include: {
        homeroomTeacher: { select: { id: true, lastName: true, firstName: true, middleName: true } },
        _count: { select: { enrollments: { where: { endsOn: null } } } },
        teachingAssignments: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, lastName: true, firstName: true, middleName: true } },
          },
        },
      },
    });

    return classes.map((item) => ({
      id: item.id,
      name: item.name,
      gradeLevel: item.gradeLevel,
      section: item.section,
      academicYearId: item.academicYearId,
      archivedAt: item.archivedAt,
      studentCount: item._count.enrollments,
      homeroomTeacher: item.homeroomTeacher
        ? { id: item.homeroomTeacher.id, fullName: fullName(item.homeroomTeacher) }
        : null,
      isHomeroom: item.homeroomTeacherId === viewer.id,
      subjects: item.teachingAssignments.map((assignment) => ({
        assignmentId: assignment.id,
        subject: assignment.subject,
        teacher: { id: assignment.teacher.id, fullName: fullName(assignment.teacher) },
        isMine: assignment.teacherId === viewer.id,
      })),
    }));
  }

  async classDetail(viewer: AuthUser, id: string) {
    if (!(await this.access.canViewClass(viewer, id))) throw notFound('Sinf');
    const item = await this.prisma.class.findUnique({
      where: { id },
      include: {
        academicYear: true,
        homeroomTeacher: { select: { id: true, lastName: true, firstName: true, middleName: true } },
        enrollments: {
          where: { endsOn: null },
          include: {
            student: {
              select: { id: true, internalId: true, lastName: true, firstName: true, middleName: true, status: true, lastActiveAt: true },
            },
          },
        },
        teachingAssignments: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, lastName: true, firstName: true, middleName: true } },
          },
        },
      },
    });
    if (!item) throw notFound('Sinf');
    const students = item.enrollments
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        startsOn: enrollment.startsOn,
        id: enrollment.student.id,
        internalId: enrollment.student.internalId,
        lastName: enrollment.student.lastName,
        firstName: enrollment.student.firstName,
        middleName: enrollment.student.middleName,
        fullName: fullName(enrollment.student),
        status: enrollment.student.status,
        lastActiveAt: enrollment.student.lastActiveAt,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'uz'));
    return {
      id: item.id,
      name: item.name,
      gradeLevel: item.gradeLevel,
      section: item.section,
      academicYear: { id: item.academicYear.id, name: item.academicYear.name, isCurrent: item.academicYear.isCurrent },
      homeroomTeacher: item.homeroomTeacher
        ? { id: item.homeroomTeacher.id, fullName: fullName(item.homeroomTeacher) }
        : null,
      students,
      subjects: item.teachingAssignments.map((assignment) => ({
        assignmentId: assignment.id,
        subject: assignment.subject,
        teacher: { id: assignment.teacher.id, fullName: fullName(assignment.teacher) },
      })),
      canManage: hasRole(viewer, 'ADMIN', 'SUPER_ADMIN'),
    };
  }

  private async assertTeacher(userId: string | null | undefined) {
    if (!userId) return;
    const count = await this.prisma.roleAssignment.count({ where: { userId, role: 'TEACHER' } });
    if (!count) throw badRequest('NOT_A_TEACHER', 'Tanlangan foydalanuvchi o‘qituvchi emas.');
  }

  async createClass(input: Out<typeof classSchema>) {
    await this.findYear(input.academicYearId);
    await this.assertTeacher(input.homeroomTeacherId);
    const name = `${input.gradeLevel}-${input.section}`;
    const created = await this.prisma.class.create({
      data: {
        academicYearId: input.academicYearId,
        gradeLevel: input.gradeLevel,
        section: input.section,
        name,
        homeroomTeacherId: input.homeroomTeacherId ?? null,
      },
    });
    await this.audit.log('class.create', { type: 'Class', id: created.id }, { name, homeroomTeacherId: input.homeroomTeacherId ?? null });
    return created;
  }

  async updateClass(id: string, input: Out<typeof updateClassSchema>) {
    const current = await this.prisma.class.findUnique({ where: { id } });
    if (!current) throw notFound('Sinf');
    await this.assertTeacher(input.homeroomTeacherId);
    const section = input.section ?? current.section;
    const updated = await this.prisma.class.update({
      where: { id },
      data: {
        section,
        name: `${current.gradeLevel}-${section}`,
        homeroomTeacherId: input.homeroomTeacherId === undefined ? current.homeroomTeacherId : input.homeroomTeacherId,
      },
    });
    await this.audit.log('class.update', { type: 'Class', id }, {
      before: { name: current.name, homeroomTeacherId: current.homeroomTeacherId },
      after: { name: updated.name, homeroomTeacherId: updated.homeroomTeacherId },
    });
    return updated;
  }

  async setClassArchived(id: string, archived: boolean) {
    const updated = await this.prisma.class.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await this.audit.log(archived ? 'class.archive' : 'class.unarchive', { type: 'Class', id });
    return updated;
  }

  // ------------------------------------------------------------ Sinfga a’zolik

  async enrollStudents(classId: string, input: Out<typeof enrollStudentsSchema>) {
    const target = await this.prisma.class.findUnique({ where: { id: classId }, include: { academicYear: true } });
    if (!target || target.archivedAt) throw notFound('Sinf');

    const students = await this.prisma.user.findMany({
      where: { id: { in: input.studentIds }, roles: { some: { role: 'STUDENT' } } },
      include: {
        enrollments: { where: { academicYearId: target.academicYearId, endsOn: null }, include: { class: true } },
      },
    });
    if (students.length !== new Set(input.studentIds).size) {
      throw badRequest('NOT_STUDENTS', 'Ro‘yxatdagi ba’zi foydalanuvchilar o‘quvchi emas yoki topilmadi.');
    }
    const alreadyEnrolled = students.filter((student) => student.enrollments.length > 0);
    if (alreadyEnrolled.length) {
      throw conflict(
        'ALREADY_ENROLLED',
        `Quyidagi o‘quvchilar bu o‘quv yilida boshqa sinfda: ${alreadyEnrolled
          .map((student) => `${fullName(student)} (${student.enrollments[0]!.class.name})`)
          .join(', ')}. Ularni “Boshqa sinfga ko‘chirish” orqali o‘tkazing.`,
      );
    }
    const startsOn = input.startsOn ? dateOnly(input.startsOn) : laterOf(dateOnly(), target.academicYear.startsOn);
    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.createMany({
        data: students.map((student) => ({
          studentId: student.id,
          classId,
          academicYearId: target.academicYearId,
          startsOn,
        })),
      });
      await this.audit.log('enrollment.add', { type: 'Class', id: classId }, { studentIds: input.studentIds }, { tx });
    });
    return { enrolled: students.length };
  }

  /**
   * Boshqa sinfga ko‘chirish: eski a’zolik yopiladi, yangisi ochiladi. Test natijalari
   * sessiyaga tayinlangan paytdagi sinf bilan qoladi — tarix qayta yozilmaydi.
   */
  async transferStudent(studentId: string, input: Out<typeof transferStudentSchema>) {
    const target = await this.prisma.class.findUnique({ where: { id: input.toClassId } });
    if (!target || target.archivedAt) throw notFound('Sinf');
    const current = await this.prisma.enrollment.findFirst({
      where: { studentId, academicYearId: target.academicYearId, endsOn: null },
      include: { class: true },
    });
    if (current?.classId === target.id) {
      throw badRequest('SAME_CLASS', 'O‘quvchi allaqachon shu sinfda.');
    }
    const date = dateOnly(input.date);
    await this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.enrollment.update({
          where: { id: current.id },
          data: { endsOn: date, endReason: 'TRANSFER' },
        });
      }
      await tx.enrollment.create({
        data: { studentId, classId: target.id, academicYearId: target.academicYearId, startsOn: date },
      });
      await this.audit.log(
        'enrollment.transfer',
        { type: 'User', id: studentId },
        { from: current?.class.name ?? null, to: target.name, date: input.date ?? null, reason: input.reason },
        { tx },
      );
    });
    return { ok: true };
  }

  async endEnrollment(enrollmentId: string, input: Out<typeof endEnrollmentSchema>) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment || enrollment.endsOn) throw notFound('Faol a’zolik');
    await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { endsOn: dateOnly(input.date), endReason: input.reason },
    });
    await this.audit.log('enrollment.end', { type: 'User', id: enrollment.studentId }, {
      classId: enrollment.classId,
      reason: input.reason,
    });
    return { ok: true };
  }

  // ------------------------------------------------------------ O‘qituvchi – fan – sinf

  async listTeachingAssignments(filter: { teacherId?: string; classId?: string; subjectId?: string }) {
    const items = await this.prisma.teachingAssignment.findMany({
      where: { ...filter, academicYear: { isCurrent: true } },
      include: {
        teacher: { select: { id: true, lastName: true, firstName: true, middleName: true } },
        subject: { select: { id: true, name: true } },
        class: { select: { id: true, name: true, gradeLevel: true } },
      },
      orderBy: [{ class: { gradeLevel: 'asc' } }, { class: { name: 'asc' } }],
    });
    return items.map((item) => ({
      id: item.id,
      teacher: { id: item.teacher.id, fullName: fullName(item.teacher) },
      subject: item.subject,
      class: item.class,
    }));
  }

  async createTeachingAssignment(input: Out<typeof teachingAssignmentSchema>) {
    await this.assertTeacher(input.teacherId);
    const target = await this.prisma.class.findUnique({ where: { id: input.classId } });
    if (!target) throw notFound('Sinf');
    const created = await this.prisma.teachingAssignment.create({
      data: { ...input, academicYearId: target.academicYearId },
    });
    await this.audit.log('teaching_assignment.create', { type: 'TeachingAssignment', id: created.id }, input);
    return created;
  }

  async deleteTeachingAssignment(id: string) {
    const existing = await this.prisma.teachingAssignment.findUnique({ where: { id } });
    if (!existing) throw notFound('Biriktiruv');
    await this.prisma.teachingAssignment.delete({ where: { id } });
    await this.audit.log('teaching_assignment.delete', { type: 'TeachingAssignment', id }, {
      teacherId: existing.teacherId,
      subjectId: existing.subjectId,
      classId: existing.classId,
    });
    return { ok: true };
  }
}

const laterOf = (a: Date, b: Date) => (a > b ? a : b);
