import { timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  FINAL_ATTEMPT_STATUSES,
  categoryEntries,
  computeAttemptDeadline,
  entryDeadline,
  isEntryOpen,
  pairPercent,
  reachesThreshold,
  type AttemptStatus,
  type Category,
  type CategoryScores,
  type GradingOverride,
  type saveAnswerSchema,
  type submitAttemptSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { AppError, badRequest, conflict, notFound, tooManyRequests } from '../common/errors.js';
import { fromJson } from '../common/json.js';
import { num } from '../common/numbers.js';
import { AppConfig } from '../config/app-config.js';
import { Prisma, type AssessmentSession, type Attempt } from '../generated/prisma/client.js';
import { GradingService } from '../grading/grading.service.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import { correctOptionOf, optionsOf, type QuestionOption } from '../questions/question-content.js';
import { reviewReleased, scoresReleased, shuffled, stateOf } from '../sessions/session-rules.js';

type Out<T extends z.ZodType> = z.output<T>;

/** Noto‘g‘ri kod urinishlari: 10 daqiqada ko‘pi bilan 10 ta. */
const CODE_FAILURE_LIMIT = 10;
const CODE_FAILURE_WINDOW_MS = 10 * 60_000;

const deviceConflict = () =>
  new AppError(
    HttpStatus.CONFLICT,
    'DEVICE_CONFLICT',
    'Bu test boshqa qurilmada yoki oynada ochilgan. Shu yerda davom ettirish uchun “Shu qurilmada davom etish” tugmasini bosing.',
  );

const timeUp = () =>
  new AppError(HttpStatus.CONFLICT, 'TIME_UP', 'Vaqt tugadi. Oxirgi saqlangan javoblaringiz baholanadi.');

const finished = () => new AppError(HttpStatus.CONFLICT, 'ATTEMPT_FINISHED', 'Bu urinish allaqachon yakunlangan.');

const invalidCode = () => badRequest('INVALID_CODE', 'Kod noto‘g‘ri, muddati o‘tgan yoki bu test sizga tayinlanmagan.');

function sameCode(a: string, b: string) {
  const left = Buffer.from(a.toUpperCase());
  const right = Buffer.from(b.toUpperCase());
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * O‘quvchi tomoni: tayinlangan testlar, kod bilan kirish, urinish, avtomatik saqlash va topshirish.
 * Javob kaliti imtihon davomida brauzerga yuborilmaydi; taymer server vaqtidan hisoblanadi.
 */
@Injectable()
export class AttemptsService {
  private readonly codeFailures = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly grading: GradingService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  // ------------------------------------------------------------ Kod tekshiruvi (tezlik cheklovi bilan)

  private assertCodeRate(userId: string) {
    const entry = this.codeFailures.get(userId);
    if (!entry) return;
    if (entry.resetAt <= Date.now()) {
      this.codeFailures.delete(userId);
      return;
    }
    if (entry.count >= CODE_FAILURE_LIMIT) {
      const minutes = Math.ceil((entry.resetAt - Date.now()) / 60_000);
      throw tooManyRequests(
        `Juda ko‘p noto‘g‘ri kod kiritildi. ${minutes} daqiqadan so‘ng qayta urinib ko‘ring yoki o‘qituvchiga murojaat qiling.`,
        'TOO_MANY_CODE_ATTEMPTS',
      );
    }
  }

  private async registerCodeFailure(user: AuthUser, sessionId: string | null) {
    const now = Date.now();
    const entry = this.codeFailures.get(user.id);
    if (!entry || entry.resetAt <= now) {
      this.codeFailures.set(user.id, { count: 1, resetAt: now + CODE_FAILURE_WINDOW_MS });
    } else {
      entry.count += 1;
    }
    await this.audit.log('attempt.invalid_code', sessionId ? { type: 'AssessmentSession', id: sessionId } : null);
  }

  // ------------------------------------------------------------ Tayinlangan testlar

  private attemptsUsed(attempts: Pick<Attempt, 'status' | 'countsTowardLimit'>[]) {
    return attempts.filter((attempt) => attempt.status !== 'CANCELLED' || attempt.countsTowardLimit).length;
  }

  async mySessions(viewer: AuthUser) {
    const now = new Date();
    const assignments = await this.prisma.sessionAssignment.findMany({
      where: { studentId: viewer.id, removedAt: null },
      include: {
        session: {
          include: {
            subject: { select: { id: true, name: true } },
            testVersion: { select: { totalPoints: true, _count: { select: { questions: true } } } },
          },
        },
        attempts: { orderBy: { attemptNo: 'asc' } },
      },
      orderBy: { session: { startsAt: 'desc' } },
      take: 200,
    });

    return assignments.map(({ session, attempts }) => {
      const state = stateOf(session, now);
      const inProgress = attempts.find((attempt) => attempt.status === 'IN_PROGRESS') ?? null;
      const used = this.attemptsUsed(attempts);
      const released = scoresReleased(session, now);
      const last = attempts.at(-1) ?? null;
      return {
        sessionId: session.id,
        title: session.title,
        subject: session.subject,
        state,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        entryClosesAt: entryDeadline(session),
        durationMinutes: session.durationMinutes,
        questionCount: session.testVersion._count.questions,
        totalPoints: num(session.testVersion.totalPoints) ?? 0,
        maxAttempts: session.maxAttempts,
        attemptsUsed: used,
        inProgressAttemptId: inProgress?.id ?? null,
        canStart: !inProgress && used < session.maxAttempts && isEntryOpen(session, now),
        lastAttempt: last
          ? {
              id: last.id,
              status: last.status as AttemptStatus,
              submittedAt: last.submittedAt,
              ...(released && (FINAL_ATTEMPT_STATUSES as readonly string[]).includes(last.status)
                ? { score: num(last.score), maxScore: num(last.maxScore), percent: pairPercent(this.total(last)) }
                : {}),
            }
          : null,
      };
    });
  }

  private total(attempt: Pick<Attempt, 'score' | 'maxScore'>) {
    return attempt.maxScore === null ? null : { earned: num(attempt.score) ?? 0, max: num(attempt.maxScore) ?? 0 };
  }

  private async assignmentFor(viewer: AuthUser, sessionId: string) {
    const assignment = await this.prisma.sessionAssignment.findUnique({
      where: { sessionId_studentId: { sessionId, studentId: viewer.id } },
      include: {
        session: {
          include: {
            subject: { select: { id: true, name: true } },
            testVersion: { select: { totalPoints: true, instructions: true, _count: { select: { questions: true } } } },
          },
        },
        attempts: { orderBy: { attemptNo: 'asc' } },
      },
    });
    if (!assignment || assignment.removedAt) throw notFound('Test');
    return assignment;
  }

  /** “Kodni kiritish”: o‘quvchiga tayinlangan ochiq testlar orasidan kod bo‘yicha topadi. */
  async findByCode(viewer: AuthUser, code: string) {
    this.assertCodeRate(viewer.id);
    const now = new Date();
    const assignments = await this.prisma.sessionAssignment.findMany({
      where: {
        studentId: viewer.id,
        removedAt: null,
        session: { cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
      },
      include: { session: true },
    });
    const match = assignments.find(
      (assignment) => isEntryOpen(assignment.session, now) && sameCode(assignment.session.accessCode, code),
    );
    if (!match) {
      await this.registerCodeFailure(viewer, null);
      throw invalidCode();
    }
    return { sessionId: match.sessionId };
  }

  /** Testni boshlashdan oldingi ma’lumot: qoidalar, vaqt, urinishlar. */
  async preview(viewer: AuthUser, sessionId: string) {
    const { session, attempts } = await this.assignmentFor(viewer, sessionId);
    const now = new Date();
    const state = stateOf(session, now);
    const used = this.attemptsUsed(attempts);
    const inProgress = attempts.find((attempt) => attempt.status === 'IN_PROGRESS') ?? null;
    let blockedReason: string | null = null;
    if (state === 'CANCELLED') blockedReason = 'Test bekor qilingan.';
    else if (state === 'SCHEDULED') blockedReason = 'Test hali boshlanmagan.';
    else if (state === 'CLOSED') blockedReason = 'Test yopilgan.';
    else if (!isEntryOpen(session, now)) blockedReason = 'Testga kirish muddati tugagan.';
    else if (!inProgress && used >= session.maxAttempts) blockedReason = 'Urinishlar soni tugagan.';

    return {
      sessionId: session.id,
      title: session.title,
      subject: session.subject,
      instructions: session.testVersion.instructions,
      state,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      entryClosesAt: entryDeadline(session),
      durationMinutes: session.durationMinutes,
      questionCount: session.testVersion._count.questions,
      totalPoints: num(session.testVersion.totalPoints) ?? 0,
      allowBackNavigation: session.allowBackNavigation,
      maxAttempts: session.maxAttempts,
      attemptsUsed: used,
      attemptPolicy: session.attemptPolicy,
      scoreVisibility: session.scoreVisibility,
      inProgressAttemptId: inProgress?.id ?? null,
      canStart: !blockedReason && !inProgress,
      blockedReason,
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        attemptNo: attempt.attemptNo,
        status: attempt.status as AttemptStatus,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
      })),
      serverNow: now,
    };
  }

  // ------------------------------------------------------------ Boshlash

  async start(viewer: AuthUser, sessionId: string, input: { code: string; clientId: string }) {
    const assignment = await this.assignmentFor(viewer, sessionId);
    const { session } = assignment;

    // Boshlangan urinish kodsiz davom etadi (kod almashtirilgan bo‘lsa ham).
    const inProgress = assignment.attempts.find((attempt) => attempt.status === 'IN_PROGRESS');
    if (inProgress) return { attemptId: inProgress.id, resumed: true };

    this.assertCodeRate(viewer.id);
    const now = new Date();
    const state = stateOf(session, now);
    if (state === 'CANCELLED') throw conflict('SESSION_CANCELLED', 'Test bekor qilingan.');
    if (state === 'SCHEDULED') throw conflict('SESSION_NOT_STARTED', 'Test hali boshlanmagan.');
    if (state === 'CLOSED') throw conflict('SESSION_CLOSED', 'Test yopilgan.');
    if (!isEntryOpen(session, now)) throw conflict('ENTRY_CLOSED', 'Testga kirish muddati tugagan.');

    // Kodni bilishning o‘zi yetmaydi: tayinlanganlik, sessiya holati va urinish huquqi ham tekshiriladi.
    if (!sameCode(session.accessCode, input.code)) {
      await this.registerCodeFailure(viewer, sessionId);
      throw invalidCode();
    }
    if (this.attemptsUsed(assignment.attempts) >= session.maxAttempts) {
      throw conflict('NO_ATTEMPTS_LEFT', 'Bu test uchun urinishlar soni tugagan.');
    }

    const testQuestions = await this.prisma.testQuestion.findMany({
      where: { testVersionId: session.testVersionId },
      orderBy: { position: 'asc' },
      include: { questionVersion: { select: { options: true } } },
    });
    const baseOrder = testQuestions.map((question) => question.id);
    const questionOrder = session.shuffleQuestions ? shuffled(baseOrder) : baseOrder;
    const optionOrder = Object.fromEntries(
      testQuestions.map((question) => {
        const ids = optionsOf(question.questionVersion).map((option) => option.id);
        return [question.id, session.shuffleOptions ? shuffled(ids) : ids];
      }),
    );
    const deadlineAt = computeAttemptDeadline({
      startedAt: now,
      durationMinutes: session.durationMinutes,
      extraMinutes: assignment.extraMinutes,
      sessionEndsAt: session.endsAt,
    });
    const attemptNo = (assignment.attempts.at(-1)?.attemptNo ?? 0) + 1;

    try {
      const attempt = await this.prisma.attempt.create({
        data: {
          sessionId,
          assignmentId: assignment.id,
          studentId: viewer.id,
          attemptNo,
          startedAt: now,
          deadlineAt,
          questionOrder,
          optionOrder: optionOrder as Prisma.InputJsonValue,
          activeClientId: input.clientId,
          lastSeenAt: now,
        },
      });
      this.codeFailures.delete(viewer.id);
      await this.audit.log('attempt.start', { type: 'Attempt', id: attempt.id }, { sessionId, attemptNo, deadlineAt });
      return { attemptId: attempt.id, resumed: false };
    } catch (error) {
      // Ikki so‘rov bir vaqtda kelsa, ikkinchi urinish yaratilmaydi — mavjudi qaytariladi.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.attempt.findFirst({
          where: { sessionId, studentId: viewer.id, status: 'IN_PROGRESS' },
        });
        if (existing) return { attemptId: existing.id, resumed: true };
      }
      throw error;
    }
  }

  // ------------------------------------------------------------ Urinishni ko‘rish

  private async ownAttempt(viewer: AuthUser, attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId }, include: { session: true } });
    // Boshqa o‘quvchining urinishi “topilmadi” sifatida qaytadi.
    if (!attempt || attempt.studentId !== viewer.id) throw notFound('Urinish');
    return attempt;
  }

  private isOverdue(attempt: { deadlineAt: Date | string }, now = Date.now()) {
    return now > new Date(attempt.deadlineAt).getTime() + this.config.answerGraceMs;
  }

  /** Muddati o‘tgan urinish brauzer yopiq bo‘lsa ham server tomonidan yakunlanadi. */
  private async finalizeIfOverdue(attempt: Attempt) {
    if (attempt.status === 'IN_PROGRESS' && this.isOverdue(attempt)) {
      await this.grading.finalize(attempt.id, 'TIMEOUT');
      return true;
    }
    return false;
  }

  async view(viewer: AuthUser, attemptId: string, clientId?: string) {
    let attempt = await this.ownAttempt(viewer, attemptId);
    if (await this.finalizeIfOverdue(attempt)) attempt = await this.ownAttempt(viewer, attemptId);
    const session = attempt.session;
    const subject = await this.prisma.subject.findUniqueOrThrow({
      where: { id: session.subjectId },
      select: { id: true, name: true },
    });
    const version = await this.prisma.testVersion.findUniqueOrThrow({
      where: { id: session.testVersionId },
      select: { instructions: true, totalPoints: true },
    });
    const base = {
      id: attempt.id,
      attemptNo: attempt.attemptNo,
      status: attempt.status as AttemptStatus,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt,
      submitSource: attempt.submitSource,
      serverNow: new Date(),
      session: {
        id: session.id,
        title: session.title,
        subject,
        instructions: version.instructions,
        allowBackNavigation: session.allowBackNavigation,
        totalPoints: num(version.totalPoints) ?? 0,
      },
    };

    if (attempt.status !== 'IN_PROGRESS') {
      return { ...base, questions: [], result: await this.resultFor(attempt, session) };
    }

    const testQuestions = await this.prisma.testQuestion.findMany({
      where: { testVersionId: session.testVersionId },
      include: { questionVersion: { select: { stem: true, options: true, type: true } } },
    });
    const answers = await this.prisma.answer.findMany({ where: { attemptId } });
    const answerMap = new Map(answers.map((answer) => [answer.testQuestionId, answer]));
    const byId = new Map(testQuestions.map((question) => [question.id, question]));
    const optionOrder = attempt.optionOrder as Record<string, string[]>;

    const questions = attempt.questionOrder.map((testQuestionId, index) => {
      const question = byId.get(testQuestionId)!;
      const options = optionsOf(question.questionVersion);
      const order = optionOrder[testQuestionId] ?? options.map((option) => option.id);
      const answer = answerMap.get(testQuestionId);
      return {
        id: testQuestionId,
        number: index + 1,
        type: question.questionVersion.type,
        stem: question.questionVersion.stem,
        // Faqat variant matnlari — javob kaliti yuborilmaydi.
        options: order
          .map((optionId) => options.find((option) => option.id === optionId))
          .filter((option): option is QuestionOption => Boolean(option)),
        points: num(question.points) ?? 0,
        answer: answer ? { optionId: answer.optionId, revision: answer.revision, savedAt: answer.savedAt } : null,
      };
    });

    return {
      ...base,
      progressIndex: attempt.progressIndex,
      deviceConflict: Boolean(clientId && attempt.activeClientId && attempt.activeClientId !== clientId),
      questions,
      result: null,
    };
  }

  /** Yakunlangan urinish natijasi — sessiyaning natija siyosatiga qarab. */
  private async resultFor(attempt: Attempt, session: AssessmentSession) {
    const now = new Date();
    const scoreVisible =
      (FINAL_ATTEMPT_STATUSES as readonly string[]).includes(attempt.status) && scoresReleased(session, now);
    const base = {
      status: attempt.status as AttemptStatus,
      submittedAt: attempt.submittedAt,
      submitSource: attempt.submitSource,
      cancelReason: attempt.status === 'CANCELLED' ? attempt.cancelReason : null,
      scoreVisible,
      reviewVisible: false,
      message: this.resultMessage(attempt.status as AttemptStatus, session, scoreVisible),
    };
    if (!scoreVisible) return base;

    const categories = (attempt.categoryScores ?? {}) as CategoryScores;
    const total = this.total(attempt)!;
    const threshold = num(session.categoryThresholdPercent) ?? 60;
    const passPercent = num(session.passPercent);
    const result = {
      ...base,
      score: { earned: total.earned, max: total.max, percent: pairPercent(total) },
      categories: categoryEntries(categories as Partial<Record<Category, { earned: number; max: number }>>).map(
        ([category, pair]) => ({
          category,
          earned: pair.earned,
          max: pair.max,
          percent: pairPercent(pair),
          reachedThreshold: reachesThreshold(pair, threshold),
        }),
      ),
      thresholdPercent: threshold,
      passPercent,
      passed: passPercent === null ? null : reachesThreshold(total, passPercent),
      gradingVersion: attempt.gradingVersion,
    };

    const stillWorking = await this.prisma.attempt.count({ where: { sessionId: session.id, status: 'IN_PROGRESS' } });
    if (!reviewReleased(session, stillWorking > 0, now)) return result;

    const [testQuestions, answers] = await Promise.all([
      this.prisma.testQuestion.findMany({
        where: { testVersionId: session.testVersionId },
        include: { questionVersion: true },
      }),
      this.prisma.answer.findMany({ where: { attemptId: attempt.id } }),
    ]);
    const answerMap = new Map(answers.map((answer) => [answer.testQuestionId, answer]));
    const overrides = fromJson<Record<string, GradingOverride>>(session.gradingOverrides);
    const byId = new Map(testQuestions.map((question) => [question.id, question]));
    return {
      ...result,
      reviewVisible: true,
      review: attempt.questionOrder.map((testQuestionId, index) => {
        const question = byId.get(testQuestionId)!;
        const answer = answerMap.get(testQuestionId);
        const override = overrides[testQuestionId];
        const correctOptionId =
          override?.mode === 'CHANGE_KEY' && override.correctOptionId
            ? override.correctOptionId
            : correctOptionOf(question.questionVersion);
        return {
          number: index + 1,
          stem: question.questionVersion.stem,
          options: optionsOf(question.questionVersion),
          selectedOptionId: answer?.optionId ?? null,
          correctOptionId,
          earned: num(answer?.pointsAwarded) ?? 0,
          max: override?.mode === 'EXCLUDE' ? 0 : (num(question.points) ?? 0),
          excluded: override?.mode === 'EXCLUDE',
          explanation: question.questionVersion.explanation,
        };
      }),
    };
  }

  private resultMessage(status: AttemptStatus, session: AssessmentSession, scoreVisible: boolean) {
    if (status === 'CANCELLED') return 'Urinish bekor qilingan.';
    if (status === 'UNDER_REVIEW') return 'Ishingiz tekshirilmoqda.';
    if (scoreVisible) return null;
    if (session.scoreVisibility === 'MANUAL')
      return 'Javoblaringiz qabul qilindi. Natija o‘qituvchi e’lon qilgach ko‘rinadi.';
    return 'Javoblaringiz qabul qilindi. Natija barcha ishtirokchilar yakunlagach yoki test yopilgach e’lon qilinadi.';
  }

  async myResults(viewer: AuthUser) {
    const attempts = await this.prisma.attempt.findMany({
      where: { studentId: viewer.id, status: { not: 'IN_PROGRESS' } },
      include: { session: { include: { subject: { select: { id: true, name: true } } } } },
      orderBy: { submittedAt: 'desc' },
      take: 200,
    });
    const now = new Date();
    return attempts.map((attempt) => {
      const visible =
        (FINAL_ATTEMPT_STATUSES as readonly string[]).includes(attempt.status) && scoresReleased(attempt.session, now);
      const total = this.total(attempt);
      return {
        attemptId: attempt.id,
        sessionId: attempt.sessionId,
        title: attempt.session.title,
        subject: attempt.session.subject,
        attemptNo: attempt.attemptNo,
        status: attempt.status as AttemptStatus,
        submittedAt: attempt.submittedAt,
        scoreVisible: visible,
        ...(visible && total
          ? {
              score: total.earned,
              maxScore: total.max,
              percent: pairPercent(total),
              categories: attempt.categoryScores as CategoryScores,
            }
          : {}),
      };
    });
  }

  // ------------------------------------------------------------ Javob saqlash

  /** Urinish qatorini qulflab, javob yozish mumkinligini tekshiradi. */
  private async lockForWrite(tx: Tx, viewer: AuthUser, attemptId: string, clientId: string) {
    const rows = await tx.$queryRaw<
      {
        id: string;
        status: string;
        deadlineAt: Date;
        activeClientId: string | null;
        questionOrder: string[];
        progressIndex: number;
        sessionId: string;
      }[]
    >`
      SELECT id, status, "deadlineAt", "activeClientId", "questionOrder", "progressIndex", "sessionId"
      FROM "Attempt" WHERE id = ${attemptId}::uuid AND "studentId" = ${viewer.id}::uuid FOR UPDATE`;
    const attempt = rows[0];
    if (!attempt) throw notFound('Urinish');
    if (attempt.status !== 'IN_PROGRESS') throw finished();
    if (attempt.activeClientId && attempt.activeClientId !== clientId) throw deviceConflict();
    return attempt;
  }

  private async validOption(tx: Tx, testQuestionId: string, optionId: string | null) {
    if (optionId === null) return;
    const question = await tx.testQuestion.findUniqueOrThrow({
      where: { id: testQuestionId },
      include: { questionVersion: { select: { options: true } } },
    });
    if (!optionsOf(question.questionVersion).some((option) => option.id === optionId)) {
      throw badRequest('INVALID_OPTION', 'Tanlangan variant bu savolga tegishli emas.');
    }
  }

  /**
   * Javobni saqlaydi. Revision raqami tufayli kechikib kelgan eski so‘rov yangi javobni
   * bosib ketmaydi; qayta yuborilgan so‘rov natijani o‘zgartirmaydi.
   */
  private async upsertAnswer(
    tx: Tx,
    attemptId: string,
    testQuestionId: string,
    optionId: string | null,
    revision: number,
  ) {
    const existing = await tx.answer.findUnique({
      where: { attemptId_testQuestionId: { attemptId, testQuestionId } },
    });
    if (existing && existing.revision >= revision) {
      return { revision: existing.revision, savedAt: existing.savedAt, stale: true };
    }
    const savedAt = new Date();
    const answer = existing
      ? await tx.answer.update({ where: { id: existing.id }, data: { optionId, revision, savedAt } })
      : await tx.answer.create({ data: { attemptId, testQuestionId, optionId, revision, savedAt } });
    return { revision: answer.revision, savedAt: answer.savedAt, stale: false };
  }

  async saveAnswer(viewer: AuthUser, attemptId: string, testQuestionId: string, input: Out<typeof saveAnswerSchema>) {
    let overdue = false;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const attempt = await this.lockForWrite(tx, viewer, attemptId, input.clientId);
        if (this.isOverdue(attempt)) {
          overdue = true;
          throw timeUp();
        }
        const index = attempt.questionOrder.indexOf(testQuestionId);
        if (index === -1) throw notFound('Savol');
        const session = await tx.assessmentSession.findUniqueOrThrow({
          where: { id: attempt.sessionId },
          select: { allowBackNavigation: true },
        });
        if (!session.allowBackNavigation && index < attempt.progressIndex) {
          throw conflict('NAVIGATION_LOCKED', 'Bu testda oldingi savollarga qaytib bo‘lmaydi.');
        }
        await this.validOption(tx, testQuestionId, input.optionId);
        const saved = await this.upsertAnswer(tx, attemptId, testQuestionId, input.optionId, input.revision);
        await tx.attempt.update({
          where: { id: attemptId },
          data: {
            lastSeenAt: new Date(),
            ...(session.allowBackNavigation ? {} : { progressIndex: Math.max(attempt.progressIndex, index) }),
          },
        });
        return saved;
      });
    } finally {
      if (overdue) {
        // Muddatdan keyin kelgan javob qabul qilinmaydi — texnik istisno sifatida qayd etiladi.
        await this.audit.log('attempt.late_answer_rejected', { type: 'Attempt', id: attemptId }, { testQuestionId });
        await this.grading.finalize(attemptId, 'TIMEOUT');
      }
    }
  }

  /** Ortga qaytish taqiqlangan testda keyingi savolga o‘tish. */
  async advance(viewer: AuthUser, attemptId: string, input: { clientId: string; toIndex: number }) {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await this.lockForWrite(tx, viewer, attemptId, input.clientId);
      const target = Math.min(Math.max(input.toIndex, 0), attempt.questionOrder.length - 1);
      const progressIndex = Math.max(attempt.progressIndex, target);
      await tx.attempt.update({ where: { id: attemptId }, data: { progressIndex, lastSeenAt: new Date() } });
      return { progressIndex };
    });
  }

  async heartbeat(viewer: AuthUser, attemptId: string, input: { clientId: string; focusLossCount?: number }) {
    const attempt = await this.ownAttempt(viewer, attemptId);
    if (await this.finalizeIfOverdue(attempt)) return { status: 'EXPIRED' as AttemptStatus, serverNow: new Date() };
    if (attempt.status !== 'IN_PROGRESS') return { status: attempt.status as AttemptStatus, serverNow: new Date() };
    const conflictDevice = Boolean(attempt.activeClientId && attempt.activeClientId !== input.clientId);
    if (!conflictDevice) {
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: {
          lastSeenAt: new Date(),
          focusLossCount: Math.max(attempt.focusLossCount, input.focusLossCount ?? 0),
        },
      });
    }
    return {
      status: attempt.status as AttemptStatus,
      serverNow: new Date(),
      deadlineAt: attempt.deadlineAt,
      deviceConflict: conflictDevice,
    };
  }

  /** Boshqa qurilmada davom etish: faqat bitta qurilma javob yoza oladi, almashish qayd etiladi. */
  async takeover(viewer: AuthUser, attemptId: string, clientId: string) {
    const attempt = await this.ownAttempt(viewer, attemptId);
    if (attempt.status !== 'IN_PROGRESS') throw finished();
    if (attempt.activeClientId !== clientId) {
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: { activeClientId: clientId, deviceChangeCount: { increment: 1 }, lastSeenAt: new Date() },
      });
      await this.audit.log('attempt.device_takeover', { type: 'Attempt', id: attemptId });
    }
    return this.view(viewer, attemptId, clientId);
  }

  // ------------------------------------------------------------ Topshirish

  /**
   * Topshirish idempotent: takroriy so‘rov bir xil natijani qaytaradi va ikkinchi urinish
   * yaratmaydi. Hali yetib bormagan javoblar topshirish bilan birga saqlanadi.
   */
  async submit(viewer: AuthUser, attemptId: string, input: Out<typeof submitAttemptSchema>) {
    const attempt = await this.ownAttempt(viewer, attemptId);
    if (attempt.status !== 'IN_PROGRESS') return this.view(viewer, attemptId, input.clientId);

    let finalized = false;
    let late = false;
    await this.prisma.$transaction(async (tx) => {
      const status = await this.grading.lockAttempt(tx, attemptId);
      if (status !== 'IN_PROGRESS') return;
      const locked = await tx.attempt.findUniqueOrThrow({ where: { id: attemptId } });
      if (locked.activeClientId && locked.activeClientId !== input.clientId) throw deviceConflict();

      late = this.isOverdue(locked);
      if (!late) {
        for (const answer of input.answers) {
          if (!locked.questionOrder.includes(answer.testQuestionId)) continue;
          await this.validOption(tx, answer.testQuestionId, answer.optionId);
          await this.upsertAnswer(tx, attemptId, answer.testQuestionId, answer.optionId, answer.revision);
        }
      }
      finalized = await this.grading.finalizeInTx(tx, attemptId, late ? 'TIMEOUT' : 'STUDENT');
    });

    if (finalized) {
      if (late && input.answers.length) {
        await this.audit.log(
          'attempt.late_answer_rejected',
          { type: 'Attempt', id: attemptId },
          { count: input.answers.length },
        );
      }
      await this.audit.log('attempt.submit', { type: 'Attempt', id: attemptId }, { late });
      await this.grading.afterFinalize(attempt.sessionId);
    }
    return this.view(viewer, attemptId, input.clientId);
  }
}
