import { Injectable } from '@nestjs/common';
import {
  FINAL_ATTEMPT_STATUSES,
  formatDateTime,
  fullName,
  gradeAttempt,
  type AttemptStatus,
  type Blueprint,
  type GradingOverride,
  type SessionState,
  type assignmentChangeSchema,
  type cancelAttemptSchema,
  type createSessionSchema,
  type regradeSchema,
  type sessionListQuerySchema,
  type updateSessionTimingSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole, isLeadership } from '../common/auth-user.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { fromJson, toJson } from '../common/json.js';
import { num } from '../common/numbers.js';
import { toPage } from '../common/pagination.js';
import type { AssessmentSession, Prisma } from '../generated/prisma/client.js';
import { GradingService, type GradingOverrides } from '../grading/grading.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import { optionsOf } from '../questions/question-content.js';
import { TestsService } from '../tests/tests.service.js';
import { randomAccessCode, scoresReleased, stateOf } from './session-rules.js';

type Out<T extends z.ZodType> = z.output<T>;

/** Aloqa uzilgan deb hisoblash uchun oxirgi signaldan keyingi vaqt. */
export const CONNECTION_ISSUE_MS = 45_000;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly tests: TestsService,
    private readonly grading: GradingService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ Yordamchilar

  async loadManaged(viewer: AuthUser, id: string) {
    const session = await this.prisma.assessmentSession.findUnique({ where: { id } });
    if (!session) throw notFound('Sessiya');
    if (!this.access.canManageSession(viewer, session)) {
      if (await this.access.canViewSessionResults(viewer, session)) {
        throw forbidden('Bu sessiyani faqat uni o‘tkazuvchi yoki rahbariyat boshqaradi.');
      }
      throw notFound('Sessiya');
    }
    return session;
  }

  async loadViewable(viewer: AuthUser, id: string) {
    const session = await this.prisma.assessmentSession.findUnique({ where: { id } });
    if (!session || !(await this.access.canViewSessionResults(viewer, session))) throw notFound('Sessiya');
    return session;
  }

  private async uniqueAccessCode(tx: Tx) {
    for (let tries = 0; tries < 20; tries += 1) {
      const code = randomAccessCode();
      const clash = await tx.assessmentSession.count({
        where: { accessCode: code, cancelledAt: null, endsAt: { gt: new Date() } },
      });
      if (!clash) return code;
    }
    throw new Error('Kirish kodini yaratib bo‘lmadi');
  }

  /**
   * Auditoriyani aniqlaydi: sinflar va alohida o‘quvchilar. O‘qituvchi faqat shu fandan dars
   * beradigan sinflariga test o‘tkaza oladi. Har bir o‘quvchining joriy sinfi saqlanadi.
   */
  private async resolveAudience(viewer: AuthUser, subjectId: string, classIds: string[], studentIds: string[]) {
    const year = await this.access.requireCurrentYear();
    const subject = await this.prisma.subject.findUniqueOrThrow({ where: { id: subjectId } });

    const classes = await this.prisma.class.findMany({
      where: { id: { in: classIds }, academicYearId: year.id, archivedAt: null },
    });
    if (classes.length !== new Set(classIds).size) throw notFound('Sinf');
    for (const item of classes) {
      if (!(await this.access.canTeach(viewer, subjectId, item.id))) {
        throw forbidden(`Siz ${item.name} sinfiga “${subject.name}” fanidan test o‘tkaza olmaysiz.`);
      }
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        academicYearId: year.id,
        endsOn: null,
        OR: [{ classId: { in: classIds } }, { studentId: { in: studentIds } }],
        student: { status: 'ACTIVE', roles: { some: { role: 'STUDENT' } } },
      },
      include: { class: true },
    });
    const byStudent = new Map<string, { studentId: string; classId: string }>();
    for (const enrollment of enrollments) {
      byStudent.set(enrollment.studentId, { studentId: enrollment.studentId, classId: enrollment.classId });
    }
    for (const studentId of studentIds) {
      const entry = byStudent.get(studentId);
      if (!entry) throw notFound('O‘quvchi');
      if (!(await this.access.canTeach(viewer, subjectId, entry.classId))) {
        throw forbidden('Tanlangan o‘quvchilardan ba’zilari siz dars beradigan sinfda emas.');
      }
    }
    return { year, subject, students: [...byStudent.values()] };
  }

  // ------------------------------------------------------------ Yaratish (7–10-bosqichlar)

  async create(viewer: AuthUser, input: Out<typeof createSessionSchema>) {
    const template = await this.tests.ensureConductPermission(viewer, input.testId);
    const { year, subject, students } = await this.resolveAudience(
      viewer,
      template.subjectId,
      input.audience.classIds,
      input.audience.studentIds,
    );
    if (students.length === 0) throw badRequest('NO_STUDENTS', 'Tanlangan auditoriyada faol o‘quvchi yo‘q.');

    const conductorId = input.conductorId ?? viewer.id;
    if (conductorId !== viewer.id) {
      const staff = await this.prisma.user.count({
        where: { id: conductorId, status: 'ACTIVE', roles: { some: { role: { in: ['TEACHER', 'DEPUTY'] } } } },
      });
      if (!staff) throw badRequest('INVALID_CONDUCTOR', 'O‘tkazuvchi faol o‘qituvchi bo‘lishi kerak.');
    }
    const extra = new Map(input.extraTime.map((item) => [item.studentId, item.minutes]));
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);

    const session = await this.prisma.$transaction(
      async (tx) => {
        const version = await this.tests.freezeForSession(tx, viewer, template.id);
        const created = await tx.assessmentSession.create({
          data: {
            testVersionId: version.id,
            title: input.title ?? template.title,
            subjectId: template.subjectId,
            academicYearId: year.id,
            createdById: viewer.id,
            conductorId,
            startsAt,
            endsAt,
            entryClosesAt: input.entryClosesAt ? new Date(input.entryClosesAt) : null,
            durationMinutes: input.durationMinutes,
            maxAttempts: input.maxAttempts,
            attemptPolicy: input.attemptPolicy,
            shuffleQuestions: input.shuffleQuestions,
            shuffleOptions: input.shuffleOptions,
            allowBackNavigation: input.allowBackNavigation,
            scoreVisibility: input.scoreVisibility,
            reviewVisibility: input.reviewVisibility,
            passPercent: input.passPercent ?? null,
            categoryThresholdPercent: input.categoryThresholdPercent,
            retakeRule: input.retakeRule,
            accessCode: await this.uniqueAccessCode(tx),
          },
        });
        await tx.sessionAssignment.createMany({
          data: students.map((student) => ({
            sessionId: created.id,
            studentId: student.studentId,
            classId: student.classId,
            extraMinutes: extra.get(student.studentId) ?? 0,
            assignedById: viewer.id,
          })),
        });
        // Bildirishnomada kirish kodi yuborilmaydi — kodni o‘tkazuvchi aytadi.
        await this.notifications.notify(
          students.map((student) => student.studentId),
          {
            type: 'TEST_ASSIGNED',
            title: `Yangi test: ${created.title}`,
            body: `${subject.name}. Boshlanish: ${formatDateTime(startsAt)}, davomiyligi ${input.durationMinutes} daqiqa.`,
            link: `/student/sessions/${created.id}`,
          },
          tx,
        );
        await this.audit.log(
          'session.create',
          { type: 'AssessmentSession', id: created.id },
          {
            testVersionId: version.id,
            classIds: input.audience.classIds,
            studentCount: students.length,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
          },
          { tx },
        );
        return created;
      },
      { timeout: 30_000 },
    );
    return this.detail(viewer, session.id);
  }

  // ------------------------------------------------------------ Ro‘yxat va tafsilot

  private stateWhere(state: SessionState, now: Date): Prisma.AssessmentSessionWhereInput {
    switch (state) {
      case 'CANCELLED':
        return { cancelledAt: { not: null } };
      case 'SCHEDULED':
        return { cancelledAt: null, startsAt: { gt: now } };
      case 'OPEN':
        return { cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } };
      case 'CLOSED':
        return { cancelledAt: null, endsAt: { lte: now } };
    }
  }

  async list(viewer: AuthUser, query: Out<typeof sessionListQuerySchema>) {
    const now = new Date();
    const and: Prisma.AssessmentSessionWhereInput[] = [];
    if (query.scope === 'all' && isLeadership(viewer)) {
      // Rahbariyat — butun maktab.
    } else if (query.scope === 'all' && hasRole(viewer, 'TEACHER')) {
      // Sinf rahbari o‘z sinfidagi barcha sessiyalarni ko‘radi.
      const homeroom = await this.access.homeroomClassIds(viewer.id);
      and.push({
        OR: [
          { createdById: viewer.id },
          { conductorId: viewer.id },
          { assignments: { some: { classId: { in: homeroom } } } },
        ],
      });
    } else {
      and.push({ OR: [{ createdById: viewer.id }, { conductorId: viewer.id }] });
    }
    if (query.state) and.push(this.stateWhere(query.state, now));
    if (query.subjectId) and.push({ subjectId: query.subjectId });
    if (query.classId) and.push({ assignments: { some: { classId: query.classId } } });
    if (query.from) and.push({ startsAt: { gte: new Date(query.from) } });
    if (query.to) and.push({ startsAt: { lte: new Date(query.to) } });
    if (query.q) and.push({ title: { contains: query.q, mode: 'insensitive' } });
    const where: Prisma.AssessmentSessionWhereInput = { AND: and };

    const [sessions, total] = await Promise.all([
      this.prisma.assessmentSession.findMany({
        where,
        orderBy: { startsAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          subject: { select: { id: true, name: true } },
          conductor: { select: { id: true, lastName: true, firstName: true, middleName: true } },
          testVersion: { select: { versionNo: true, templateId: true, totalPoints: true } },
          assignments: { where: { removedAt: null }, select: { class: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.assessmentSession.count({ where }),
    ]);
    const counts = await this.attemptCounts(sessions.map((session) => session.id));

    return toPage(
      sessions.map((session) => {
        const classes = new Map<string, string>();
        for (const assignment of session.assignments) {
          if (assignment.class) classes.set(assignment.class.id, assignment.class.name);
        }
        const count = counts.get(session.id);
        return {
          id: session.id,
          title: session.title,
          subject: session.subject,
          state: stateOf(session, now),
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          durationMinutes: session.durationMinutes,
          classes: [...classes].map(([id, name]) => ({ id, name })),
          conductor: { id: session.conductor.id, fullName: fullName(session.conductor) },
          templateId: session.testVersion.templateId,
          versionNo: session.testVersion.versionNo,
          totalPoints: num(session.testVersion.totalPoints) ?? 0,
          assignedCount: session.assignments.length,
          finishedCount: count?.finished ?? 0,
          inProgressCount: count?.inProgress ?? 0,
          resultsPublishedAt: session.resultsPublishedAt,
          canManage: this.access.canManageSession(viewer, session),
        };
      }),
      total,
      query,
    );
  }

  private async attemptCounts(sessionIds: string[]) {
    const map = new Map<string, { finished: number; inProgress: number }>();
    if (sessionIds.length === 0) return map;
    const rows = await this.prisma.attempt.groupBy({
      by: ['sessionId', 'status'],
      where: { sessionId: { in: sessionIds } },
      _count: { studentId: true },
    });
    for (const row of rows) {
      const entry = map.get(row.sessionId) ?? { finished: 0, inProgress: 0 };
      if ((FINAL_ATTEMPT_STATUSES as readonly string[]).includes(row.status)) entry.finished += row._count.studentId;
      if (row.status === 'IN_PROGRESS') entry.inProgress += row._count.studentId;
      map.set(row.sessionId, entry);
    }
    return map;
  }

  async detail(viewer: AuthUser, id: string) {
    const session = await this.loadViewable(viewer, id);
    const canManage = this.access.canManageSession(viewer, session);
    const [full, counts, revisions] = await Promise.all([
      this.prisma.assessmentSession.findUniqueOrThrow({
        where: { id },
        include: {
          subject: { select: { id: true, name: true } },
          conductor: { select: { id: true, lastName: true, firstName: true, middleName: true } },
          createdBy: { select: { id: true, lastName: true, firstName: true, middleName: true } },
          testVersion: {
            include: {
              template: { select: { id: true, title: true, gradeLevel: true } },
              _count: { select: { questions: true } },
            },
          },
          assignments: {
            where: { removedAt: null },
            select: { class: { select: { id: true, name: true } }, extraMinutes: true, studentId: true },
          },
        },
      }),
      this.attemptCounts([id]),
      this.prisma.gradeRevision.findMany({
        where: { sessionId: id },
        orderBy: { version: 'desc' },
        include: { createdBy: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
      }),
    ]);
    const classes = new Map<string, string>();
    for (const assignment of full.assignments) if (assignment.class) classes.set(assignment.class.id, assignment.class.name);
    const count = counts.get(id);
    return {
      id: full.id,
      title: full.title,
      subject: full.subject,
      state: stateOf(full),
      startsAt: full.startsAt,
      endsAt: full.endsAt,
      entryClosesAt: full.entryClosesAt,
      durationMinutes: full.durationMinutes,
      maxAttempts: full.maxAttempts,
      attemptPolicy: full.attemptPolicy,
      shuffleQuestions: full.shuffleQuestions,
      shuffleOptions: full.shuffleOptions,
      allowBackNavigation: full.allowBackNavigation,
      scoreVisibility: full.scoreVisibility,
      reviewVisibility: full.reviewVisibility,
      passPercent: num(full.passPercent),
      categoryThresholdPercent: num(full.categoryThresholdPercent) ?? 60,
      retakeRule: full.retakeRule,
      resultsPublishedAt: full.resultsPublishedAt,
      reviewOpenedAt: full.reviewOpenedAt,
      cancelledAt: full.cancelledAt,
      cancelReason: full.cancelReason,
      gradingVersion: full.gradingVersion,
      gradingOverrides: fromJson<GradingOverrides>(full.gradingOverrides),
      conductor: { id: full.conductor.id, fullName: fullName(full.conductor) },
      createdBy: { id: full.createdBy.id, fullName: fullName(full.createdBy) },
      test: {
        templateId: full.testVersion.template.id,
        title: full.testVersion.title,
        versionId: full.testVersion.id,
        versionNo: full.testVersion.versionNo,
        gradeLevel: full.testVersion.template.gradeLevel,
        totalPoints: num(full.testVersion.totalPoints) ?? 0,
        questionCount: full.testVersion._count.questions,
        blueprint: full.testVersion.blueprint as Blueprint,
      },
      classes: [...classes].map(([classId, name]) => ({ id: classId, name })),
      assignedCount: full.assignments.length,
      finishedCount: count?.finished ?? 0,
      inProgressCount: count?.inProgress ?? 0,
      // Kirish kodi faqat sessiyani boshqaruvchilarga ko‘rinadi.
      accessCode: canManage ? full.accessCode : null,
      accessCodeRotatedAt: canManage ? full.accessCodeRotatedAt : null,
      canManage,
      revisions: revisions.map((revision) => ({
        id: revision.id,
        version: revision.version,
        reason: revision.reason,
        change: revision.change,
        affectedCount: revision.affectedCount,
        createdAt: revision.createdAt,
        createdBy: { id: revision.createdBy.id, fullName: fullName(revision.createdBy) },
      })),
    };
  }

  // ------------------------------------------------------------ Vaqtni boshqarish

  async updateTiming(viewer: AuthUser, id: string, input: Out<typeof updateSessionTimingSchema>) {
    const session = await this.loadManaged(viewer, id);
    const now = new Date();
    const state = stateOf(session, now);
    if (state === 'CANCELLED') throw conflict('SESSION_CANCELLED', 'Bekor qilingan sessiyani o‘zgartirib bo‘lmaydi.');
    if (state !== 'SCHEDULED' && (input.startsAt || input.durationMinutes)) {
      throw conflict('ALREADY_STARTED', 'Boshlangan sessiyada faqat yopilish va kirish muddatini o‘zgartirish mumkin.');
    }
    const startsAt = input.startsAt ? new Date(input.startsAt) : session.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : session.endsAt;
    const entryClosesAt =
      input.entryClosesAt === undefined ? session.entryClosesAt : input.entryClosesAt ? new Date(input.entryClosesAt) : null;
    if (endsAt <= startsAt) throw badRequest('INVALID_TIMING', 'Yopilish vaqti boshlanishidan keyin bo‘lishi kerak.');
    if (entryClosesAt && (entryClosesAt <= startsAt || entryClosesAt > endsAt)) {
      throw badRequest('INVALID_TIMING', 'Kirish muddati sessiya vaqti ichida bo‘lishi kerak.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentSession.update({
        where: { id },
        data: {
          startsAt,
          endsAt,
          entryClosesAt,
          durationMinutes: input.durationMinutes ?? session.durationMinutes,
        },
      });
      if (endsAt.getTime() !== session.endsAt.getTime()) {
        await this.adjustDeadlines(tx, id, session, endsAt, now);
      }
      const students = await tx.sessionAssignment.findMany({ where: { sessionId: id, removedAt: null }, select: { studentId: true } });
      await this.notifications.notify(
        students.map((item) => item.studentId),
        {
          type: 'TEST_TIME_CHANGED',
          title: `Test vaqti o‘zgardi: ${session.title}`,
          body: `Boshlanish: ${formatDateTime(startsAt)}, yopilish: ${formatDateTime(endsAt)}.`,
          link: `/student/sessions/${id}`,
        },
        tx,
      );
      await this.audit.log(
        'session.timing_changed',
        { type: 'AssessmentSession', id },
        {
          before: { startsAt: session.startsAt, endsAt: session.endsAt, entryClosesAt: session.entryClosesAt, durationMinutes: session.durationMinutes },
          after: { startsAt, endsAt, entryClosesAt, durationMinutes: input.durationMinutes ?? session.durationMinutes },
          reason: input.reason,
        },
        { tx },
      );
    });
    if (endsAt <= now) await this.finalizeInProgress(id, 'STAFF');
    return this.detail(viewer, id);
  }

  /**
   * Yopilish vaqti o‘zgarganda ishlayotganlarning muddati qayta hisoblanadi:
   * qisqartirilsa — yangi yopilishdan oshmaydi; uzaytirilsa — yopilishga “kesilgan”
   * urinishlar o‘z davomiyligigacha uzayadi.
   */
  private async adjustDeadlines(tx: Tx, sessionId: string, session: AssessmentSession, newEndsAt: Date, now: Date) {
    const attempts = await tx.attempt.findMany({
      where: { sessionId, status: 'IN_PROGRESS' },
      include: { assignment: { select: { extraMinutes: true } } },
    });
    for (const attempt of attempts) {
      let deadline = attempt.deadlineAt;
      if (newEndsAt < session.endsAt) {
        deadline = new Date(Math.min(deadline.getTime(), Math.max(newEndsAt.getTime(), now.getTime())));
      } else if (attempt.deadlineAt.getTime() === session.endsAt.getTime()) {
        const ownLimit =
          attempt.startedAt.getTime() + (session.durationMinutes + attempt.assignment.extraMinutes) * 60_000;
        deadline = new Date(Math.min(ownLimit, newEndsAt.getTime()));
      }
      if (deadline.getTime() !== attempt.deadlineAt.getTime()) {
        await tx.attempt.update({ where: { id: attempt.id }, data: { deadlineAt: deadline } });
      }
    }
  }

  private async finalizeInProgress(sessionId: string, source: 'STAFF' | 'TIMEOUT') {
    const attempts = await this.prisma.attempt.findMany({
      where: { sessionId, status: 'IN_PROGRESS' },
      select: { id: true },
    });
    for (const attempt of attempts) {
      await this.prisma.$transaction((tx) => this.grading.finalizeInTx(tx, attempt.id, source));
    }
    await this.grading.afterFinalize(sessionId);
  }

  async startNow(viewer: AuthUser, id: string) {
    const session = await this.loadManaged(viewer, id);
    if (stateOf(session) !== 'SCHEDULED') throw conflict('NOT_SCHEDULED', 'Sessiya allaqachon boshlangan yoki yopilgan.');
    const now = new Date();
    if (session.endsAt <= now) throw conflict('INVALID_TIMING', 'Sessiya yopilish vaqti o‘tib ketgan.');
    await this.prisma.assessmentSession.update({ where: { id }, data: { startsAt: now } });
    await this.audit.log('session.started', { type: 'AssessmentSession', id });
    return this.detail(viewer, id);
  }

  /** Sessiyani hozir yopish: ishlayotganlarning javoblari saqlangan holatda baholanadi. */
  async closeNow(viewer: AuthUser, id: string) {
    const session = await this.loadManaged(viewer, id);
    if (stateOf(session) !== 'OPEN') throw conflict('NOT_OPEN', 'Faqat ochiq sessiyani yopish mumkin.');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentSession.update({
        where: { id },
        data: { endsAt: now, entryClosesAt: session.entryClosesAt && session.entryClosesAt < now ? session.entryClosesAt : now },
      });
      await tx.attempt.updateMany({
        where: { sessionId: id, status: 'IN_PROGRESS', deadlineAt: { gt: now } },
        data: { deadlineAt: now },
      });
      await this.audit.log('session.closed', { type: 'AssessmentSession', id }, { closedEarly: true }, { tx });
    });
    await this.finalizeInProgress(id, 'STAFF');
    return this.detail(viewer, id);
  }

  async cancel(viewer: AuthUser, id: string, reason: string) {
    const session = await this.loadManaged(viewer, id);
    if (session.cancelledAt) throw conflict('ALREADY_CANCELLED', 'Sessiya allaqachon bekor qilingan.');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentSession.update({ where: { id }, data: { cancelledAt: now, cancelReason: reason } });
      await tx.attempt.updateMany({
        where: { sessionId: id, status: 'IN_PROGRESS' },
        data: { status: 'CANCELLED', cancelledAt: now, cancelledById: viewer.id, cancelReason: reason },
      });
      const students = await tx.sessionAssignment.findMany({ where: { sessionId: id, removedAt: null }, select: { studentId: true } });
      await this.notifications.notify(
        students.map((item) => item.studentId),
        { type: 'TEST_CANCELLED', title: `Test bekor qilindi: ${session.title}`, body: reason, link: '/student' },
        tx,
      );
      await this.audit.log('session.cancelled', { type: 'AssessmentSession', id }, { reason }, { tx });
    });
    return this.detail(viewer, id);
  }

  /** Kodni almashtirish: eski kod yangi kirishlar uchun bekor bo‘ladi, boshlangan urinishlar davom etadi. */
  async rotateCode(viewer: AuthUser, id: string) {
    const session = await this.loadManaged(viewer, id);
    const state = stateOf(session);
    if (state === 'CLOSED' || state === 'CANCELLED') throw conflict('SESSION_FINISHED', 'Yopilgan sessiya kodini almashtirib bo‘lmaydi.');
    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentSession.update({
        where: { id },
        data: {
          accessCode: await this.uniqueAccessCode(tx),
          accessCodeVersion: { increment: 1 },
          accessCodeRotatedAt: new Date(),
        },
      });
      await this.audit.log('session.code_rotated', { type: 'AssessmentSession', id }, undefined, { tx });
    });
    return this.detail(viewer, id);
  }

  async publishResults(viewer: AuthUser, id: string) {
    const session = await this.loadManaged(viewer, id);
    if (session.cancelledAt) throw conflict('SESSION_CANCELLED', 'Bekor qilingan sessiya natijalari e’lon qilinmaydi.');
    const inProgress = await this.prisma.attempt.count({ where: { sessionId: id, status: 'IN_PROGRESS' } });
    if (inProgress > 0) {
      throw conflict('STILL_IN_PROGRESS', `Hali ${inProgress} nafar o‘quvchi testni ishlamoqda. Natijalarni ular yakunlagach e’lon qiling.`);
    }
    await this.grading.publishResults(id, viewer);
    return this.detail(viewer, id);
  }

  async openReview(viewer: AuthUser, id: string) {
    const session = await this.loadManaged(viewer, id);
    if (stateOf(session) !== 'CLOSED') {
      throw conflict('NOT_CLOSED', 'To‘g‘ri javoblarni faqat sessiya yopilgach ochish mumkin.');
    }
    await this.prisma.assessmentSession.update({ where: { id }, data: { reviewOpenedAt: new Date() } });
    await this.audit.log('session.review_opened', { type: 'AssessmentSession', id });
    return this.detail(viewer, id);
  }

  // ------------------------------------------------------------ Auditoriya va individual amallar

  async changeAssignments(viewer: AuthUser, id: string, input: Out<typeof assignmentChangeSchema>) {
    const session = await this.loadManaged(viewer, id);
    if (session.cancelledAt) throw conflict('SESSION_CANCELLED', 'Bekor qilingan sessiya.');
    const now = new Date();
    if (input.addStudentIds.length) {
      const { students } = await this.resolveAudience(viewer, session.subjectId, [], input.addStudentIds);
      for (const student of students) {
        await this.prisma.sessionAssignment.upsert({
          where: { sessionId_studentId: { sessionId: id, studentId: student.studentId } },
          update: { removedAt: null, removedById: null, removeReason: null },
          create: { sessionId: id, studentId: student.studentId, classId: student.classId, assignedById: viewer.id },
        });
      }
      await this.notifications.notify(input.addStudentIds, {
        type: 'TEST_ASSIGNED',
        title: `Yangi test: ${session.title}`,
        body: `Boshlanish: ${formatDateTime(session.startsAt)}.`,
        link: `/student/sessions/${id}`,
      });
    }
    for (const studentId of input.removeStudentIds) {
      const started = await this.prisma.attempt.count({ where: { sessionId: id, studentId } });
      if (started) {
        throw conflict('HAS_ATTEMPT', 'Testni boshlagan o‘quvchini ro‘yxatdan olib bo‘lmaydi — kerak bo‘lsa urinishini bekor qiling.');
      }
      await this.prisma.sessionAssignment.updateMany({
        where: { sessionId: id, studentId, removedAt: null },
        data: { removedAt: now, removedById: viewer.id, removeReason: input.reason },
      });
    }
    await this.audit.log('session.assignments_changed', { type: 'AssessmentSession', id }, {
      added: input.addStudentIds,
      removed: input.removeStudentIds,
      reason: input.reason,
    });
    return this.live(viewer, id);
  }

  /** Individual vaqt uzaytirish (sabab bilan, auditga yoziladi). */
  async extendTime(viewer: AuthUser, id: string, studentId: string, minutes: number, reason: string) {
    const session = await this.loadManaged(viewer, id);
    const assignment = await this.prisma.sessionAssignment.findUnique({
      where: { sessionId_studentId: { sessionId: id, studentId } },
    });
    if (!assignment || assignment.removedAt) throw notFound('O‘quvchi');
    const attempt = await this.prisma.attempt.findFirst({ where: { sessionId: id, studentId, status: 'IN_PROGRESS' } });
    await this.prisma.$transaction(async (tx) => {
      await tx.sessionAssignment.update({
        where: { id: assignment.id },
        data: { extraMinutes: { increment: minutes } },
      });
      let newDeadline: Date | null = null;
      if (attempt) {
        newDeadline = new Date(attempt.deadlineAt.getTime() + minutes * 60_000);
        await tx.attempt.update({ where: { id: attempt.id }, data: { deadlineAt: newDeadline } });
      }
      await this.notifications.notify(
        [studentId],
        {
          type: 'TEST_TIME_CHANGED',
          title: `Sizga qo‘shimcha ${minutes} daqiqa berildi: ${session.title}`,
          link: attempt ? `/student/attempts/${attempt.id}` : `/student/sessions/${id}`,
        },
        tx,
      );
      await this.audit.log(
        'attempt.time_extended',
        { type: 'AssessmentSession', id },
        { studentId, minutes, reason, attemptId: attempt?.id ?? null, newDeadline },
        { tx },
      );
    });
    return this.live(viewer, id);
  }

  async cancelAttempt(viewer: AuthUser, attemptId: string, input: Out<typeof cancelAttemptSchema>) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId }, include: { session: true } });
    if (!attempt || !this.access.canManageSession(viewer, attempt.session)) throw notFound('Urinish');
    if (attempt.status === 'CANCELLED') throw conflict('ALREADY_CANCELLED', 'Urinish allaqachon bekor qilingan.');
    await this.prisma.$transaction(async (tx) => {
      await this.grading.lockAttempt(tx, attemptId);
      await tx.attempt.update({
        where: { id: attemptId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: viewer.id,
          cancelReason: input.reason,
          countsTowardLimit: !input.allowRetake,
        },
      });
      await this.notifications.notify(
        [attempt.studentId],
        {
          type: 'ATTEMPT_CANCELLED',
          title: `Urinishingiz bekor qilindi: ${attempt.session.title}`,
          body: input.allowRetake ? `${input.reason}. Testni qayta topshirishingiz mumkin.` : input.reason,
          link: `/student/sessions/${attempt.sessionId}`,
        },
        tx,
      );
      await this.audit.log(
        'attempt.cancelled',
        { type: 'Attempt', id: attemptId },
        { previousStatus: attempt.status, reason: input.reason, allowRetake: input.allowRetake },
        { tx },
      );
    });
    return { ok: true };
  }

  // ------------------------------------------------------------ Jonli kuzatuv

  async live(viewer: AuthUser, id: string) {
    const session = await this.loadManaged(viewer, id);
    const now = Date.now();
    const [assignments, questionCount] = await Promise.all([
      this.prisma.sessionAssignment.findMany({
        where: { sessionId: id, removedAt: null },
        include: {
          student: { select: { id: true, internalId: true, lastName: true, firstName: true, middleName: true } },
          class: { select: { id: true, name: true } },
          attempts: {
            orderBy: { attemptNo: 'desc' },
            include: { _count: { select: { answers: { where: { optionId: { not: null } } } } } },
          },
        },
      }),
      this.prisma.testQuestion.count({ where: { testVersionId: session.testVersionId } }),
    ]);

    const counts = { assigned: 0, notStarted: 0, inProgress: 0, finished: 0, connectionIssue: 0, cancelled: 0 };
    const rows = assignments
      .map((assignment) => {
        const latest = assignment.attempts[0] ?? null;
        const status: AttemptStatus | 'NOT_STARTED' = latest ? (latest.status as AttemptStatus) : 'NOT_STARTED';
        const lastSignal = latest ? (latest.lastSeenAt ?? latest.startedAt).getTime() : null;
        const connectionIssue = status === 'IN_PROGRESS' && lastSignal !== null && now - lastSignal > CONNECTION_ISSUE_MS;
        counts.assigned += 1;
        if (status === 'NOT_STARTED') counts.notStarted += 1;
        else if (status === 'IN_PROGRESS') counts.inProgress += 1;
        else if (status === 'CANCELLED') counts.cancelled += 1;
        else counts.finished += 1;
        if (connectionIssue) counts.connectionIssue += 1;
        return {
          studentId: assignment.student.id,
          internalId: assignment.student.internalId,
          fullName: fullName(assignment.student),
          className: assignment.class?.name ?? null,
          status,
          attemptId: latest?.id ?? null,
          attemptsCount: assignment.attempts.length,
          startedAt: latest?.startedAt ?? null,
          deadlineAt: latest?.deadlineAt ?? null,
          submittedAt: latest?.submittedAt ?? null,
          submitSource: latest?.submitSource ?? null,
          answered: latest?._count.answers ?? 0,
          questionCount,
          lastSeenAt: latest?.lastSeenAt ?? null,
          connectionIssue,
          focusLossCount: latest?.focusLossCount ?? 0,
          deviceChangeCount: latest?.deviceChangeCount ?? 0,
          extraMinutes: assignment.extraMinutes,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'uz'));

    return {
      sessionId: id,
      state: stateOf(session),
      serverNow: new Date(),
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      accessCode: session.accessCode,
      counts,
      rows,
    };
  }

  // ------------------------------------------------------------ Qayta baholash

  /**
   * Xato savol topilganda: sabab → siyosat → qayta hisoblash → yangi baholash versiyasi →
   * bildirishnoma. Oldingi va yangi natija saqlanadi, izsiz o‘zgartirish yo‘q.
   */
  async regrade(viewer: AuthUser, id: string, input: Out<typeof regradeSchema>) {
    const session = await this.loadManaged(viewer, id);
    const testQuestion = await this.prisma.testQuestion.findFirst({
      where: { id: input.testQuestionId, testVersionId: session.testVersionId },
      include: { questionVersion: true },
    });
    if (!testQuestion) throw notFound('Savol');
    if (input.mode === 'CHANGE_KEY' && !optionsOf(testQuestion.questionVersion).some((option) => option.id === input.correctOptionId)) {
      throw badRequest('INVALID_OPTION', 'Yangi to‘g‘ri javob savol variantlaridan biri bo‘lishi kerak.');
    }
    const inProgress = await this.prisma.attempt.count({ where: { sessionId: id, status: 'IN_PROGRESS' } });
    if (inProgress) {
      throw conflict('STILL_IN_PROGRESS', 'Qayta baholash uchun barcha o‘quvchilar testni yakunlashi kerak.');
    }

    const override: GradingOverride = input.mode === 'CHANGE_KEY'
      ? { mode: input.mode, correctOptionId: input.correctOptionId }
      : { mode: input.mode };
    const affectedStudents: string[] = [];

    const revision = await this.prisma.$transaction(
      async (tx) => {
        const fresh = await tx.assessmentSession.findUniqueOrThrow({ where: { id } });
        const overrides = { ...fromJson<GradingOverrides>(fresh.gradingOverrides), [input.testQuestionId]: override };
        const version = fresh.gradingVersion + 1;
        await tx.assessmentSession.update({
          where: { id },
          data: { gradingOverrides: toJson(overrides), gradingVersion: version },
        });
        const questions = await this.grading.gradableQuestions(tx, session.testVersionId);
        const attempts = await tx.attempt.findMany({
          where: { sessionId: id, status: { in: [...FINAL_ATTEMPT_STATUSES] } },
          include: { answers: true },
        });
        const items: { attemptId: string; before: Prisma.InputJsonValue; after: Prisma.InputJsonValue }[] = [];
        for (const attempt of attempts) {
          const answers = Object.fromEntries(attempt.answers.map((answer) => [answer.testQuestionId, { optionId: answer.optionId }]));
          const grade = gradeAttempt(questions, answers, overrides);
          const before = { score: num(attempt.score), maxScore: num(attempt.maxScore), categories: attempt.categoryScores };
          const after = { score: grade.total.earned, maxScore: grade.total.max, categories: grade.categories };
          await this.grading.writeGrade(tx, attempt.id, grade, version);
          items.push({ attemptId: attempt.id, before: toJson(before), after: toJson(after) });
          if (before.score !== after.score || before.maxScore !== after.maxScore) affectedStudents.push(attempt.studentId);
        }
        const created = await tx.gradeRevision.create({
          data: {
            sessionId: id,
            version,
            reason: input.reason,
            change: toJson({ testQuestionId: input.testQuestionId, ...override }),
            affectedCount: affectedStudents.length,
            createdById: viewer.id,
            items: { create: items },
          },
        });
        await this.audit.log(
          'grades.revised',
          { type: 'AssessmentSession', id },
          { version, testQuestionId: input.testQuestionId, mode: input.mode, reason: input.reason, affected: affectedStudents.length },
          { tx },
        );
        return created;
      },
      { timeout: 60_000 },
    );

    // Natijasini ko‘ra oladigan o‘quvchilarga qayta hisoblash haqida xabar beriladi.
    if (scoresReleased(session) && affectedStudents.length) {
      await this.notifications.notify(affectedStudents, {
        type: 'GRADES_REVISED',
        title: `Natijangiz qayta hisoblandi: ${session.title}`,
        body: input.reason,
        link: '/student/results',
      });
    }
    return { revisionId: revision.id, version: revision.version, affectedCount: affectedStudents.length };
  }

  async revisionDetail(viewer: AuthUser, id: string, revisionId: string) {
    await this.loadViewable(viewer, id);
    const revision = await this.prisma.gradeRevision.findFirst({
      where: { id: revisionId, sessionId: id },
      include: {
        items: {
          include: {
            attempt: {
              select: { id: true, student: { select: { id: true, internalId: true, lastName: true, firstName: true, middleName: true } } },
            },
          },
        },
      },
    });
    if (!revision) throw notFound('Qayta baholash');
    return {
      id: revision.id,
      version: revision.version,
      reason: revision.reason,
      change: revision.change,
      createdAt: revision.createdAt,
      items: revision.items.map((item) => ({
        attemptId: item.attemptId,
        student: { id: item.attempt.student.id, internalId: item.attempt.student.internalId, fullName: fullName(item.attempt.student) },
        before: item.before,
        after: item.after,
      })),
    };
  }
}
