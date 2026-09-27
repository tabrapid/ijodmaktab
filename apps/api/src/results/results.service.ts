import { Injectable } from '@nestjs/common';
import {
  CATEGORIES,
  FINAL_ATTEMPT_STATUSES,
  computeClassMetrics,
  computeQuestionStats,
  fullName,
  normalizeForSearch,
  pairPercent,
  reachesThreshold,
  selectCountedAttempt,
  type Category,
  type CategoryScores,
  type GradingOverride,
  type ParticipationStatus,
  type QuestionOutcome,
  type ResultFilters,
  type ScorePair,
} from '@ijod/shared';
import { AccessService, type Viewer } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole } from '../common/auth-user.js';
import { notFound } from '../common/errors.js';
import { fromJson } from '../common/json.js';
import { num } from '../common/numbers.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { correctOptionOf, optionsOf } from '../questions/question-content.js';
import { stateOf } from '../sessions/session-rules.js';

const OPTION_LETTERS = 'ABCDEFGHIJ';

export interface ResultRow {
  studentId: string;
  internalId: number;
  fullName: string;
  classId: string | null;
  className: string | null;
  status: ParticipationStatus;
  attemptId: string | null;
  attemptNo: number | null;
  attemptsCount: number;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  categories: Partial<Record<Category, { earned: number; max: number; percent: number | null; reached: boolean }>>;
  passed: boolean | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  durationSeconds: number | null;
  submitSource: string | null;
}

/**
 * Sessiya natijalari, ko‘rsatkichlar va savollar tahlili. Ekran va eksport aynan shu
 * hisob-kitobdan foydalanadi — fayldagi va ekrandagi ball/foizlar bir xil bo‘ladi.
 */
@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async assertCanView(viewer: Viewer, sessionId: string) {
    const session = await this.prisma.assessmentSession.findUnique({ where: { id: sessionId } });
    if (!session || !(await this.access.canViewSessionResults(viewer, session))) throw notFound('Sessiya');
    return session;
  }

  async sessionResults(viewer: AuthUser, sessionId: string, filters: ResultFilters = {}) {
    const session = await this.assertCanView(viewer, sessionId);
    if (hasRole(viewer, 'SUPER_ADMIN')) {
      // Super admin natijalarni ko‘rishi mumkin, lekin har bir murojaat qayd etiladi.
      await this.audit.log('results.view', { type: 'AssessmentSession', id: sessionId });
    }
    const limitToClasses = await this.viewerClassLimit(viewer, session);
    return this.build(sessionId, filters, limitToClasses);
  }

  /** Sinf rahbari (sessiyani boshqarmaydigan) faqat o‘z sinfi natijalarini ko‘radi. */
  async viewerClassLimit(viewer: Viewer, session: { id: string; createdById: string; conductorId: string }) {
    if (this.access.canManageSession(viewer, session)) return null;
    return this.access.homeroomClassIds(viewer.id);
  }

  async build(sessionId: string, filters: ResultFilters = {}, limitToClasses: string[] | null = null) {
    const session = await this.prisma.assessmentSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        subject: { select: { id: true, name: true } },
        conductor: { select: { id: true, lastName: true, firstName: true, middleName: true } },
        testVersion: { select: { id: true, title: true, versionNo: true, totalPoints: true } },
      },
    });
    const [testQuestions, assignments] = await Promise.all([
      this.prisma.testQuestion.findMany({
        where: { testVersionId: session.testVersionId },
        orderBy: { position: 'asc' },
        include: { questionVersion: true },
      }),
      this.prisma.sessionAssignment.findMany({
        where: {
          sessionId,
          removedAt: null,
          classId: limitToClasses ? { in: limitToClasses } : undefined,
        },
        include: {
          student: { select: { id: true, internalId: true, lastName: true, firstName: true, middleName: true } },
          class: { select: { id: true, name: true } },
          attempts: { include: { answers: true }, orderBy: { attemptNo: 'asc' } },
        },
      }),
    ]);

    const overrides = fromJson<Record<string, GradingOverride>>(session.gradingOverrides);
    const threshold = num(session.categoryThresholdPercent) ?? 60;
    const passPercent = num(session.passPercent);

    const questions = testQuestions.map((item, index) => {
      const override = overrides[item.id];
      const correctOptionId =
        override?.mode === 'CHANGE_KEY' && override.correctOptionId
          ? override.correctOptionId
          : correctOptionOf(item.questionVersion);
      return {
        testQuestionId: item.id,
        number: index + 1,
        category: item.questionVersion.category as Category,
        points: override?.mode === 'EXCLUDE' ? 0 : num(item.points) ?? 0,
        originalPoints: num(item.points) ?? 0,
        stem: item.questionVersion.stem,
        options: optionsOf(item.questionVersion).map((option, optionIndex) => ({
          ...option,
          letter: OPTION_LETTERS[optionIndex] ?? String(optionIndex + 1),
        })),
        correctOptionId,
        override: override ?? null,
      };
    });

    // Testdagi kategoriyalar va ularning maksimal ballari.
    const categories = CATEGORIES.map((category) => {
      const own = questions.filter((question) => question.category === category);
      return {
        category,
        count: own.length,
        max: own.reduce((sum, question) => sum + Math.round(question.points * 100), 0) / 100,
      };
    }).filter((item) => item.count > 0);

    const matrix: Record<string, Record<string, { outcome: QuestionOutcome; earned: number; selectedOptionId: string | null }>> = {};
    const responsesByStudent = new Map<string, { questionId: string; outcome: QuestionOutcome; selectedOptionId: string | null }[]>();

    let rows: ResultRow[] = assignments.map((assignment) => {
      const attempts = assignment.attempts.map((attempt) => ({
        ...attempt,
        total:
          attempt.maxScore === null ? null : ({ earned: num(attempt.score) ?? 0, max: num(attempt.maxScore) ?? 0 } as ScorePair),
      }));
      const counted = selectCountedAttempt(attempts, session.attemptPolicy);
      const status: ParticipationStatus = counted ? (counted.status as ParticipationStatus) : 'NOT_STARTED';
      const isFinal = counted && (FINAL_ATTEMPT_STATUSES as readonly string[]).includes(counted.status);
      const categoryScores = (isFinal ? counted.categoryScores : null) as CategoryScores | null;

      if (isFinal && counted) {
        const answerMap = new Map(counted.answers.map((answer) => [answer.testQuestionId, answer]));
        const cells: Record<string, { outcome: QuestionOutcome; earned: number; selectedOptionId: string | null }> = {};
        const responses: { questionId: string; outcome: QuestionOutcome; selectedOptionId: string | null }[] = [];
        for (const question of questions) {
          const answer = answerMap.get(question.testQuestionId);
          const selected = answer?.optionId ?? null;
          const outcome: QuestionOutcome =
            question.override?.mode === 'EXCLUDE'
              ? 'EXCLUDED'
              : question.override?.mode === 'FULL_CREDIT'
                ? 'CREDITED'
                : selected === null
                  ? 'BLANK'
                  : selected === question.correctOptionId
                    ? 'CORRECT'
                    : 'WRONG';
          const earned = outcome === 'CORRECT' || outcome === 'CREDITED' ? question.points : 0;
          cells[question.testQuestionId] = { outcome, earned, selectedOptionId: selected };
          responses.push({ questionId: question.testQuestionId, outcome, selectedOptionId: selected });
        }
        matrix[assignment.studentId] = cells;
        responsesByStudent.set(assignment.studentId, responses);
      }

      const total = isFinal ? counted.total : null;
      const startedAt = counted?.startedAt ?? null;
      const submittedAt = counted?.submittedAt ?? null;
      return {
        studentId: assignment.student.id,
        internalId: assignment.student.internalId,
        fullName: fullName(assignment.student),
        classId: assignment.class?.id ?? null,
        className: assignment.class?.name ?? null,
        status,
        attemptId: counted?.id ?? null,
        attemptNo: counted?.attemptNo ?? null,
        attemptsCount: attempts.length,
        score: total?.earned ?? null,
        maxScore: total?.max ?? null,
        percent: total ? pairPercent(total) : null,
        categories: Object.fromEntries(
          Object.entries(categoryScores ?? {}).map(([category, pair]) => [
            category,
            { ...pair, percent: pairPercent(pair), reached: reachesThreshold(pair, threshold) },
          ]),
        ),
        passed: total && passPercent !== null ? reachesThreshold(total, passPercent) : null,
        startedAt,
        submittedAt,
        durationSeconds:
          startedAt && submittedAt ? Math.max(0, Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000)) : null,
        submitSource: counted?.submitSource ?? null,
      };
    });

    rows.sort((a, b) => (a.className ?? '').localeCompare(b.className ?? '', 'uz') || a.fullName.localeCompare(b.fullName, 'uz') || a.internalId - b.internalId);
    rows = applyFilters(rows, filters);

    const metricInput = (subset: ResultRow[]) =>
      subset.map((row) => ({
        status: row.status,
        total: row.score !== null && row.maxScore !== null ? { earned: row.score, max: row.maxScore } : null,
        categories: Object.fromEntries(
          Object.entries(row.categories).map(([category, value]) => [category, { earned: value.earned, max: value.max }]),
        ) as CategoryScores,
      }));
    const metrics = computeClassMetrics(metricInput(rows), { thresholdPercent: threshold, passPercent });

    const classIds = [...new Set(rows.map((row) => row.classId).filter((value): value is string => Boolean(value)))];
    const byClass = classIds.map((classId) => {
      const subset = rows.filter((row) => row.classId === classId);
      return {
        classId,
        className: subset[0]?.className ?? '',
        metrics: computeClassMetrics(metricInput(subset), { thresholdPercent: threshold, passPercent }),
      };
    });

    const includedStudents = new Set(rows.map((row) => row.studentId));
    const questionStats = computeQuestionStats(
      questions.map((question) => ({
        questionId: question.testQuestionId,
        correctOptionId: question.correctOptionId,
        optionIds: question.options.map((option) => option.id),
      })),
      rows.flatMap((row) => responsesByStudent.get(row.studentId) ?? []),
    ).map((stats, index) => ({ ...stats, number: index + 1 }));

    return {
      session: {
        id: session.id,
        title: session.title,
        subject: session.subject,
        state: stateOf(session),
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        durationMinutes: session.durationMinutes,
        conductor: { id: session.conductor.id, fullName: fullName(session.conductor) },
        attemptPolicy: session.attemptPolicy,
        categoryThresholdPercent: threshold,
        passPercent,
        gradingVersion: session.gradingVersion,
        resultsPublishedAt: session.resultsPublishedAt,
        testTitle: session.testVersion.title,
        testVersionNo: session.testVersion.versionNo,
        totalPoints: questions.reduce((sum, question) => sum + Math.round(question.points * 100), 0) / 100,
      },
      categories,
      questions,
      rows,
      metrics,
      byClass,
      questionStats,
      matrix: Object.fromEntries(Object.entries(matrix).filter(([studentId]) => includedStudents.has(studentId))),
      filters,
      limitedToClasses: limitToClasses,
      generatedAt: new Date(),
    };
  }
}

export type SessionResults = Awaited<ReturnType<ResultsService['build']>>;

/** Filtrlar ekran, ko‘rsatkichlar va eksportga bir xil qo‘llanadi. */
export function applyFilters(rows: ResultRow[], filters: ResultFilters): ResultRow[] {
  const q = filters.q ? normalizeForSearch(filters.q) : null;
  return rows.filter((row) => {
    if (filters.statuses?.length && !filters.statuses.includes(row.status)) return false;
    if (filters.classIds?.length && (!row.classId || !filters.classIds.includes(row.classId))) return false;
    if (filters.minPercent !== undefined && (row.percent === null || row.percent < filters.minPercent)) return false;
    if (filters.maxPercent !== undefined && (row.percent === null || row.percent > filters.maxPercent)) return false;
    if (q && !normalizeForSearch(`${row.fullName} ${row.internalId}`).includes(q)) return false;
    return true;
  });
}
