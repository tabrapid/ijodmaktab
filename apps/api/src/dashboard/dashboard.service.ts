import { existsSync, readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import {
  CATEGORIES,
  FINAL_ATTEMPT_STATUSES,
  ROLES,
  fullName,
  percentOf,
  ratio,
  schoolToday,
  type Category,
  type Role,
} from '@ijod/shared';
import { AccessService } from '../access/access.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole } from '../common/auth-user.js';
import { recentServerErrors } from '../common/http-exception.filter.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { stateOf } from '../sessions/session-rules.js';

const FINAL = Prisma.join([...FINAL_ATTEMPT_STATUSES].map((status) => Prisma.sql`${status}::"AttemptStatus"`));

/**
 * `DISTINCT ON (at."assignmentId")` uchun tartib: har tayinlovdan sessiya siyosati bo‘yicha
 * hisobga olinadigan urinish qoladi (birinchi / oxirgi / eng yuqori foiz, tenglikda ertaroq urinish) —
 * `selectCountedAttempt` bilan bir xil. So‘rovda `s` — AssessmentSession.
 */
const COUNTED_ORDER = Prisma.sql`at."assignmentId",
  CASE WHEN s."attemptPolicy" = 'LAST' THEN -at."attemptNo" ELSE 0 END,
  CASE WHEN s."attemptPolicy" = 'BEST' THEN at.score / NULLIF(at."maxScore", 0) END DESC NULLS LAST,
  at."attemptNo"`;

/** Toshkent bo‘yicha bugungi kun chegaralari (UTC). */
function todayRange(now = new Date()) {
  const start = new Date(`${schoolToday(now)}T00:00:00+05:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

/**
 * Bosh sahifalar uchun jamlangan ko‘rsatkichlar. O‘qituvchilar sifati faqat test foizi bilan
 * avtomatik reyting qilinmaydi — ko‘rsatkichlar sinf, fan va mavzu kesimida beriladi.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  // ------------------------------------------------------------ O‘qituvchi

  async teacher(viewer: AuthUser) {
    const now = new Date();
    const { start, end } = todayRange(now);
    const mine: Prisma.AssessmentSessionWhereInput = { OR: [{ createdById: viewer.id }, { conductorId: viewer.id }] };
    const [today, upcomingCount, draftTests, homeroom, recent] = await Promise.all([
      this.prisma.assessmentSession.findMany({
        where: {
          AND: [
            mine,
            { cancelledAt: null },
            { OR: [{ startsAt: { gte: start, lt: end } }, { startsAt: { lte: now }, endsAt: { gt: now } }] },
          ],
        },
        orderBy: { startsAt: 'asc' },
        include: {
          subject: { select: { id: true, name: true } },
          assignments: { where: { removedAt: null }, select: { class: { select: { id: true, name: true } } } },
          attempts: { select: { status: true } },
        },
        take: 20,
      }),
      this.prisma.assessmentSession.count({
        where: {
          AND: [mine, { cancelledAt: null, startsAt: { gte: end, lt: new Date(end.getTime() + 7 * 86_400_000) } }],
        },
      }),
      this.prisma.testTemplate.count({ where: { ownerId: viewer.id, status: 'DRAFT' } }),
      this.access.homeroomClassIds(viewer.id),
      this.prisma.assessmentSession.findMany({
        where: { AND: [mine, { cancelledAt: null, endsAt: { lte: now } }] },
        orderBy: { endsAt: 'desc' },
        take: 5,
        include: { subject: { select: { id: true, name: true } } },
      }),
    ]);

    const pendingReview = homeroom.length
      ? await this.prisma.portfolioItem.count({
          where: {
            status: 'SUBMITTED',
            owner: { enrollments: { some: { classId: { in: homeroom }, endsOn: null } } },
          },
        })
      : 0;

    const recentStats = await this.sessionStats(recent.map((session) => session.id));

    return {
      today: today.map((session) => {
        const classes = new Map<string, string>();
        for (const assignment of session.assignments)
          if (assignment.class) classes.set(assignment.class.id, assignment.class.name);
        return {
          id: session.id,
          title: session.title,
          subject: session.subject,
          state: stateOf(session, now),
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          classes: [...classes].map(([id, name]) => ({ id, name })),
          assignedCount: session.assignments.length,
          inProgressCount: session.attempts.filter((attempt) => attempt.status === 'IN_PROGRESS').length,
          finishedCount: session.attempts.filter((attempt) =>
            (FINAL_ATTEMPT_STATUSES as readonly string[]).includes(attempt.status),
          ).length,
        };
      }),
      upcomingCount,
      draftTests,
      pendingReview,
      recent: recent.map((session) => ({
        id: session.id,
        title: session.title,
        subject: session.subject,
        endsAt: session.endsAt,
        ...recentStats.get(session.id)!,
      })),
      difficultTopics: await this.difficultTopics(
        Prisma.sql`(s."createdById" = ${viewer.id}::uuid OR s."conductorId" = ${viewer.id}::uuid)`,
      ),
    };
  }

  /** Sessiyalar bo‘yicha qatnashish va umumiy o‘zlashtirish (hisobga olinadigan urinish bo‘yicha). */
  private async sessionStats(sessionIds: string[]) {
    const map = new Map<string, { participation: ReturnType<typeof ratio>; mastery: ReturnType<typeof ratio> }>();
    if (sessionIds.length === 0) return map;
    const rows = await this.prisma.$queryRaw<
      { sessionId: string; assigned: number; finished: number; earned: number | null; max: number | null }[]
    >`
      WITH counted AS (
        SELECT DISTINCT ON (at."assignmentId") at."assignmentId", at.score, at."maxScore"
        FROM "Attempt" at JOIN "AssessmentSession" s ON s.id = at."sessionId"
        WHERE at.status IN (${FINAL}) AND at."sessionId" = ANY(${sessionIds}::uuid[])
        ORDER BY ${COUNTED_ORDER}
      )
      SELECT sa."sessionId" AS "sessionId",
             COUNT(*)::int AS assigned,
             COUNT(c."assignmentId")::int AS finished,
             SUM(c.score)::float AS earned,
             SUM(c."maxScore")::float AS max
      FROM "SessionAssignment" sa
      LEFT JOIN counted c ON c."assignmentId" = sa.id
      WHERE sa."removedAt" IS NULL AND sa."sessionId" = ANY(${sessionIds}::uuid[])
      GROUP BY sa."sessionId"`;
    for (const row of rows) {
      map.set(row.sessionId, {
        participation: ratio(row.finished, row.assigned),
        mastery: ratio(row.earned ?? 0, row.max ?? 0),
      });
    }
    for (const id of sessionIds) if (!map.has(id)) map.set(id, { participation: ratio(0, 0), mastery: ratio(0, 0) });
    return map;
  }

  /** Mavzular bo‘yicha qiyinchiliklar (so‘nggi 60 kun): to‘g‘ri javob ulushi eng past mavzular. */
  private async difficultTopics(scope: Prisma.Sql) {
    const rows = await this.prisma.$queryRaw<{ topic: string; subject: string; correct: number; total: number }[]>`
      WITH counted AS (
        SELECT DISTINCT ON (at."assignmentId") at.id, at."sessionId"
        FROM "Attempt" at JOIN "AssessmentSession" s ON s.id = at."sessionId"
        WHERE ${scope}
          AND at.status IN (${FINAL})
          AND s."cancelledAt" IS NULL
          AND s."startsAt" > now() - interval '60 days'
        ORDER BY ${COUNTED_ORDER}
      )
      SELECT COALESCE(NULLIF(q.topic, ''), NULLIF(tt.topic, ''), 'Mavzu ko‘rsatilmagan') AS topic,
             sub.name AS subject,
             COUNT(a.id) FILTER (WHERE a."isCorrect")::int AS correct,
             COUNT(*)::int AS total
      FROM counted ct
      JOIN "AssessmentSession" s ON s.id = ct."sessionId"
      JOIN "TestQuestion" tq ON tq."testVersionId" = s."testVersionId"
      LEFT JOIN "Answer" a ON a."attemptId" = ct.id AND a."testQuestionId" = tq.id
      JOIN "QuestionVersion" qv ON qv.id = tq."questionVersionId"
      JOIN "Question" q ON q.id = qv."questionId"
      JOIN "TestVersion" tv ON tv.id = s."testVersionId"
      JOIN "TestTemplate" tt ON tt.id = tv."templateId"
      JOIN "Subject" sub ON sub.id = s."subjectId"
      GROUP BY 1, 2
      HAVING COUNT(*) >= 5
      ORDER BY COUNT(a.id) FILTER (WHERE a."isCorrect")::float / COUNT(*) ASC
      LIMIT 5`;
    return rows.map((row) => ({ topic: row.topic, subject: row.subject, correctRate: ratio(row.correct, row.total) }));
  }

  // ------------------------------------------------------------ Rahbariyat

  async leadership() {
    const year = await this.access.currentYear();
    const now = new Date();
    const yearFilter = year ? Prisma.sql`s."academicYearId" = ${year.id}::uuid` : Prisma.sql`TRUE`;

    const [classRows, subjectRows, categoryRows, trendRows, counts, pendingPortfolio, pendingQuestions, recent] =
      await Promise.all([
        this.prisma.$queryRaw<
          {
            classId: string;
            name: string;
            gradeLevel: number;
            sessions: number;
            assigned: number;
            finished: number;
            earned: number | null;
            max: number | null;
          }[]
        >`
        WITH counted AS (
          SELECT DISTINCT ON (at."assignmentId") at."assignmentId", at.score, at."maxScore"
          FROM "Attempt" at JOIN "AssessmentSession" s ON s.id = at."sessionId"
          WHERE at.status IN (${FINAL})
          ORDER BY ${COUNTED_ORDER}
        )
        SELECT c.id AS "classId", c.name, c."gradeLevel",
               COUNT(DISTINCT s.id)::int AS sessions,
               COUNT(sa.id)::int AS assigned,
               COUNT(ct."assignmentId")::int AS finished,
               SUM(ct.score)::float AS earned, SUM(ct."maxScore")::float AS max
        FROM "SessionAssignment" sa
        JOIN "AssessmentSession" s ON s.id = sa."sessionId"
        JOIN "Class" c ON c.id = sa."classId"
        LEFT JOIN counted ct ON ct."assignmentId" = sa.id
        WHERE sa."removedAt" IS NULL AND s."cancelledAt" IS NULL AND s."endsAt" <= now() AND ${yearFilter}
        GROUP BY c.id, c.name, c."gradeLevel"
        ORDER BY c."gradeLevel", c.name`,
        this.prisma.$queryRaw<
          { subjectId: string; name: string; sessions: number; earned: number | null; max: number | null }[]
        >`
        WITH counted AS (
          SELECT DISTINCT ON (at."assignmentId") at."assignmentId", at."sessionId", at.score, at."maxScore"
          FROM "Attempt" at JOIN "AssessmentSession" s ON s.id = at."sessionId"
          WHERE at.status IN (${FINAL})
          ORDER BY ${COUNTED_ORDER}
        )
        SELECT sub.id AS "subjectId", sub.name, COUNT(DISTINCT s.id)::int AS sessions,
               SUM(ct.score)::float AS earned, SUM(ct."maxScore")::float AS max
        FROM "AssessmentSession" s
        JOIN "Subject" sub ON sub.id = s."subjectId"
        LEFT JOIN counted ct ON ct."sessionId" = s.id
        WHERE s."cancelledAt" IS NULL AND s."endsAt" <= now() AND ${yearFilter}
        GROUP BY sub.id, sub.name
        ORDER BY sub.name`,
        this.prisma.$queryRaw<{ category: string; earned: number | null; max: number | null }[]>`
        WITH counted AS (
          SELECT DISTINCT ON (at."assignmentId") at."categoryScores"
          FROM "Attempt" at JOIN "AssessmentSession" s ON s.id = at."sessionId"
          WHERE at.status IN (${FINAL}) AND s."cancelledAt" IS NULL AND s."endsAt" <= now() AND ${yearFilter}
          ORDER BY ${COUNTED_ORDER}
        )
        SELECT kv.key AS category, SUM((kv.value->>'earned')::numeric)::float AS earned, SUM((kv.value->>'max')::numeric)::float AS max
        FROM counted, jsonb_each(counted."categoryScores") kv
        GROUP BY kv.key`,
        this.prisma.$queryRaw<{ month: string; earned: number | null; max: number | null }[]>`
        WITH counted AS (
          SELECT DISTINCT ON (at."assignmentId") at."submittedAt", at.score, at."maxScore"
          FROM "Attempt" at JOIN "AssessmentSession" s ON s.id = at."sessionId"
          WHERE at.status IN (${FINAL}) AND s."cancelledAt" IS NULL AND s."endsAt" <= now() AND ${yearFilter}
          ORDER BY ${COUNTED_ORDER}
        )
        SELECT to_char(("submittedAt" AT TIME ZONE 'Asia/Tashkent'), 'YYYY-MM') AS month,
               SUM(score)::float AS earned, SUM("maxScore")::float AS max
        FROM counted GROUP BY 1 ORDER BY 1`,
        Promise.all([
          this.prisma.user.count({ where: { status: 'ACTIVE', roles: { some: { role: 'STUDENT' } } } }),
          this.prisma.user.count({ where: { status: 'ACTIVE', roles: { some: { role: 'TEACHER' } } } }),
          year ? this.prisma.class.count({ where: { academicYearId: year.id, archivedAt: null } }) : 0,
          this.prisma.assessmentSession.count({ where: { cancelledAt: null, academicYearId: year?.id } }),
          this.prisma.assessmentSession.count({
            where: { cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
          }),
          this.prisma.attempt.count({ where: { status: 'IN_PROGRESS' } }),
          this.prisma.attempt.count({ where: { status: 'UNDER_REVIEW' } }),
        ]),
        this.prisma.portfolioItem.count({ where: { status: 'SUBMITTED' } }),
        this.prisma.question.count({
          where: { visibility: 'PRIVATE', schoolRequestedAt: { not: null }, archivedAt: null },
        }),
        this.prisma.assessmentSession.findMany({
          where: { cancelledAt: null, academicYearId: year?.id },
          orderBy: { startsAt: 'desc' },
          take: 8,
          include: {
            subject: { select: { id: true, name: true } },
            conductor: { select: { id: true, lastName: true, firstName: true, middleName: true } },
          },
        }),
      ]);
    const [students, teachers, classes, sessions, openSessions, inProgress, underReview] = counts;
    const recentStats = await this.sessionStats(recent.map((session) => session.id));

    const totals = classRows.reduce(
      (sum, row) => ({ assigned: sum.assigned + row.assigned, finished: sum.finished + row.finished }),
      { assigned: 0, finished: 0 },
    );
    const categoryMastery: Partial<Record<Category, ReturnType<typeof ratio>>> = {};
    for (const row of categoryRows) {
      if ((CATEGORIES as readonly string[]).includes(row.category)) {
        categoryMastery[row.category as Category] = ratio(round2(row.earned ?? 0), round2(row.max ?? 0));
      }
    }

    return {
      academicYear: year ? { id: year.id, name: year.name } : null,
      totals: { students, teachers, classes, sessions, openSessions },
      participation: ratio(totals.finished, totals.assigned),
      unfinished: { inProgress, underReview },
      pending: { portfolio: pendingPortfolio, schoolQuestions: pendingQuestions },
      classes: classRows.map((row) => ({
        classId: row.classId,
        name: row.name,
        gradeLevel: row.gradeLevel,
        sessions: row.sessions,
        participation: ratio(row.finished, row.assigned),
        mastery: ratio(round2(row.earned ?? 0), round2(row.max ?? 0)),
      })),
      subjects: subjectRows.map((row) => ({
        subjectId: row.subjectId,
        name: row.name,
        sessions: row.sessions,
        mastery: ratio(round2(row.earned ?? 0), round2(row.max ?? 0)),
      })),
      categoryMastery,
      trend: trendRows.map((row) => ({ month: row.month, percent: percentOf(row.earned ?? 0, row.max ?? 0) })),
      recentSessions: recent.map((session) => ({
        id: session.id,
        title: session.title,
        subject: session.subject,
        state: stateOf(session, now),
        startsAt: session.startsAt,
        conductor: { id: session.conductor.id, fullName: fullName(session.conductor) },
        ...recentStats.get(session.id)!,
      })),
      difficultTopics: await this.difficultTopics(Prisma.sql`TRUE`),
    };
  }

  // ------------------------------------------------------------ Administrator

  async admin() {
    const year = await this.access.currentYear();
    const [roleCounts, statusCounts, locked, mustChange, withoutClass, withoutHomeroom, classes, subjects, imports] =
      await Promise.all([
        this.prisma.roleAssignment.groupBy({
          by: ['role'],
          where: { user: { status: 'ACTIVE' } },
          _count: { userId: true },
        }),
        this.prisma.user.groupBy({ by: ['status'], _count: { id: true } }),
        this.prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
        this.prisma.user.count({ where: { status: 'ACTIVE', mustChangePassword: true } }),
        this.prisma.user.count({
          where: {
            status: 'ACTIVE',
            roles: { some: { role: 'STUDENT' } },
            enrollments: { none: { endsOn: null, academicYearId: year?.id } },
          },
        }),
        year
          ? this.prisma.class.count({ where: { academicYearId: year.id, archivedAt: null, homeroomTeacherId: null } })
          : 0,
        year ? this.prisma.class.count({ where: { academicYearId: year.id, archivedAt: null } }) : 0,
        this.prisma.subject.count({ where: { isActive: true } }),
        this.prisma.importBatch.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { createdBy: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
        }),
      ]);
    const byRole = Object.fromEntries(ROLES.map((role) => [role, 0])) as Record<Role, number>;
    for (const row of roleCounts) byRole[row.role as Role] = row._count.userId;
    return {
      academicYear: year ? { id: year.id, name: year.name } : null,
      users: {
        byRole,
        byStatus: Object.fromEntries(statusCounts.map((row) => [row.status, row._count.id])),
        locked,
        mustChangePassword: mustChange,
      },
      studentsWithoutClass: withoutClass,
      classesWithoutHomeroom: withoutHomeroom,
      classes,
      subjects,
      recentImports: imports.map((batch) => ({
        id: batch.id,
        fileName: batch.fileName,
        createdAt: batch.createdAt,
        committedAt: batch.committedAt,
        createdBy: fullName(batch.createdBy),
        created: (batch.summary as { created?: number } | null)?.created ?? null,
      })),
    };
  }

  // ------------------------------------------------------------ Super admin

  async system(viewer: AuthUser) {
    if (!hasRole(viewer, 'SUPER_ADMIN')) return null;
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const [admin, activeSessions, failedLogins, mfaStaff, exportsReady, exportsFailed, recentAudit, quarantined] =
      await Promise.all([
        this.admin(),
        this.prisma.authSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
        // Bloklashga olib kelgan urinish “auth.account_locked” sifatida yoziladi — u ham muvaffaqiyatsiz kirish.
        this.prisma.auditEvent.count({
          where: { action: { in: ['auth.login_failed', 'auth.account_locked'] }, createdAt: { gt: since } },
        }),
        // Ikki bosqichli kirish yoqilgan xodimlar (o‘quvchilar hisobga olinmaydi).
        this.prisma.user.count({
          where: {
            totpEnabledAt: { not: null },
            status: 'ACTIVE',
            roles: { some: { role: { in: ['TEACHER', 'DEPUTY', 'ADMIN', 'SUPER_ADMIN'] } } },
          },
        }),
        this.prisma.exportJob.count({ where: { status: 'READY' } }),
        this.prisma.exportJob.count({ where: { status: 'FAILED', createdAt: { gt: since } } }),
        this.prisma.auditEvent.findMany({
          orderBy: { id: 'desc' },
          take: 12,
          include: { actor: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
        }),
        this.prisma.fileAsset.count({ where: { status: 'QUARANTINED' } }),
      ]);
    return {
      ...admin,
      security: { activeSessions, failedLogins24h: failedLogins, mfaEnabled: mfaStaff, quarantinedFiles: quarantined },
      exports: { ready: exportsReady, failed24h: exportsFailed },
      backup: backupStatus(),
      errors: recentServerErrors(),
      recentAudit: recentAudit.map((event) => ({
        id: event.id.toString(),
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        createdAt: event.createdAt,
        actor: event.actor ? fullName(event.actor) : 'Tizim',
      })),
    };
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Zaxira skripti muvaffaqiyatli tugaganda yozadigan fayl (scripts/backup.sh). */
function backupStatus() {
  const file = process.env.BACKUP_STATUS_FILE;
  if (!file || !existsSync(file)) return { configured: Boolean(file), lastSuccessAt: null as string | null };
  try {
    const value = readFileSync(file, 'utf8').trim();
    return { configured: true, lastSuccessAt: Number.isNaN(Date.parse(value)) ? null : new Date(value).toISOString() };
  } catch {
    return { configured: true, lastSuccessAt: null };
  }
}
