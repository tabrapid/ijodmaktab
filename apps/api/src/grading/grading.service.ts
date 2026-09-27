import { Injectable } from '@nestjs/common';
import {
  FINAL_ATTEMPT_STATUSES,
  gradeAttempt,
  type AttemptGrade,
  type Category,
  type GradableQuestion,
  type GradingOverride,
  type SubmitSource,
} from '@ijod/shared';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { fromJson } from '../common/json.js';
import { num } from '../common/numbers.js';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import { correctOptionOf } from '../questions/question-content.js';

export type GradingOverrides = Record<string, GradingOverride>;

/**
 * Baholash: urinishni yakunlash, ballarni yozish va natijalarni e’lon qilish qoidalari.
 * Barcha yakunlashlar urinish qatorini qulflab bajariladi, shuning uchun parallel
 * “Topshirish”, taymer va avtomatik saqlash bir-birini buzmaydi.
 */
@Injectable()
export class GradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async gradableQuestions(client: Tx | PrismaService, testVersionId: string): Promise<GradableQuestion[]> {
    const items = await client.testQuestion.findMany({
      where: { testVersionId },
      orderBy: { position: 'asc' },
      include: { questionVersion: true },
    });
    return items.map((item) => ({
      id: item.id,
      type: item.questionVersion.type,
      category: item.questionVersion.category as Category,
      points: num(item.points) ?? 0,
      answerKey: { correctOptionId: correctOptionOf(item.questionVersion) },
    }));
  }

  /** Urinish qatorini tranzaksiya oxirigacha qulflaydi. */
  async lockAttempt(tx: Tx, attemptId: string) {
    const rows = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM "Attempt" WHERE id = ${attemptId}::uuid FOR UPDATE`;
    return rows[0]?.status ?? null;
  }

  /** Baho natijasini urinish va javoblarga yozadi. */
  async writeGrade(tx: Tx, attemptId: string, grade: AttemptGrade, gradingVersion: number, gradedAt = new Date()) {
    if (grade.questions.length > 0) {
      const values = Prisma.join(
        grade.questions.map(
          (question) =>
            Prisma.sql`(${question.questionId}::uuid, ${question.outcome === 'CORRECT' || question.outcome === 'CREDITED'}::boolean, ${question.earned}::numeric)`,
        ),
      );
      await tx.$executeRaw`
        UPDATE "Answer" AS a
        SET "isCorrect" = v.correct, "pointsAwarded" = v.points
        FROM (VALUES ${values}) AS v(tq, correct, points)
        WHERE a."attemptId" = ${attemptId}::uuid AND a."testQuestionId" = v.tq`;
    }
    await tx.attempt.update({
      where: { id: attemptId },
      data: {
        score: grade.total.earned,
        maxScore: grade.total.max,
        categoryScores: grade.categories as Prisma.InputJsonValue,
        gradedAt,
        gradingVersion,
      },
    });
  }

  async computeGrade(tx: Tx, attemptId: string) {
    const attempt = await tx.attempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { session: true, answers: true },
    });
    const questions = await this.gradableQuestions(tx, attempt.session.testVersionId);
    const answers = Object.fromEntries(
      attempt.answers.map((answer) => [answer.testQuestionId, { optionId: answer.optionId }]),
    );
    const grade = gradeAttempt(questions, answers, fromJson<GradingOverrides>(attempt.session.gradingOverrides));
    return { attempt, grade };
  }

  /**
   * Urinishni yakunlaydi va baholaydi. Allaqachon yakunlangan bo‘lsa hech narsa qilmaydi
   * (takroriy topshirish qo‘shimcha urinish yoki boshqa natija yaratmaydi).
   */
  async finalizeInTx(tx: Tx, attemptId: string, source: SubmitSource, now = new Date()): Promise<boolean> {
    const status = await this.lockAttempt(tx, attemptId);
    if (status !== 'IN_PROGRESS') return false;
    const { attempt, grade } = await this.computeGrade(tx, attemptId);
    await this.writeGrade(tx, attemptId, grade, attempt.session.gradingVersion, now);
    await tx.attempt.update({
      where: { id: attemptId },
      data: {
        status: source === 'STUDENT' ? 'SUBMITTED' : 'EXPIRED',
        submittedAt: now,
        submitSource: source,
      },
    });
    return true;
  }

  async finalize(attemptId: string, source: SubmitSource) {
    const done = await this.prisma.$transaction((tx) => this.finalizeInTx(tx, attemptId, source));
    if (done) {
      const attempt = await this.prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { sessionId: true } });
      await this.afterFinalize(attempt.sessionId);
    }
    return done;
  }

  /**
   * “Hamma yakunlagach” siyosatida oxirgi o‘quvchi topshirgach natijalar avtomatik e’lon qilinadi.
   */
  async afterFinalize(sessionId: string) {
    const session = await this.prisma.assessmentSession.findUnique({ where: { id: sessionId } });
    if (!session || session.resultsPublishedAt || session.cancelledAt) return;
    if (session.scoreVisibility !== 'AFTER_ALL_DONE') return;

    const assignments = await this.prisma.sessionAssignment.findMany({
      where: { sessionId, removedAt: null },
      select: { studentId: true, attempts: { select: { status: true } } },
    });
    const everyoneDone = assignments.every((assignment) =>
      assignment.attempts.some((attempt) => (FINAL_ATTEMPT_STATUSES as readonly string[]).includes(attempt.status)),
    );
    const closed = session.endsAt.getTime() <= Date.now();
    const inProgress = assignments.some((assignment) =>
      assignment.attempts.some((attempt) => attempt.status === 'IN_PROGRESS'),
    );
    if ((everyoneDone || closed) && !inProgress) await this.publishResults(sessionId, null);
  }

  /** Natijalarni e’lon qiladi va yakunlangan ishi bor o‘quvchilarga bildirishnoma yuboradi. */
  async publishResults(sessionId: string, actor: Pick<AuthUser, 'id' | 'roles'> | null) {
    const updated = await this.prisma.assessmentSession.updateMany({
      where: { id: sessionId, resultsPublishedAt: null },
      data: { resultsPublishedAt: new Date() },
    });
    if (updated.count === 0) return false;
    const session = await this.prisma.assessmentSession.findUniqueOrThrow({ where: { id: sessionId } });
    const attempts = await this.prisma.attempt.findMany({
      where: { sessionId, status: { in: [...FINAL_ATTEMPT_STATUSES] } },
      select: { id: true, studentId: true },
    });
    const byStudent = new Map(attempts.map((attempt) => [attempt.studentId, attempt.id]));
    for (const [studentId, attemptId] of byStudent) {
      await this.notifications.notify([studentId], {
        type: 'RESULTS_PUBLISHED',
        title: `Natija e’lon qilindi: ${session.title}`,
        link: `/student/results/${attemptId}`,
      });
    }
    await this.audit.log(
      'session.results_published',
      { type: 'AssessmentSession', id: sessionId },
      { automatic: actor === null },
      { actor },
    );
    return true;
  }
}
