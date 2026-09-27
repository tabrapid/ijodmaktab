import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { formatDateTime } from '@ijod/shared';
import { AppConfig } from '../config/app-config.js';
import { ExportsService } from '../exports/exports.service.js';
import { GradingService } from '../grading/grading.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const REMINDER_BEFORE_MS = 15 * 60_000;

/**
 * Fon vazifalari: vaqti tugagan urinishlarni yakunlash (brauzer yopiq bo‘lsa ham),
 * natijalarni avtomatik e’lon qilish, boshlanish eslatmalari va eskirgan eksportlarni tozalash.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Jobs');
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly grading: GradingService,
    private readonly notifications: NotificationsService,
    private readonly exports: ExportsService,
    private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.backgroundJobs) await this.exports.resumePending();
  }

  @Interval(10_000)
  async tick() {
    if (!this.config.backgroundJobs || this.running) return;
    this.running = true;
    try {
      await this.sweep();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.stack : String(error));
    } finally {
      this.running = false;
    }
  }

  async sweep(now = new Date()) {
    await this.finalizeOverdueAttempts(now);
    await this.publishClosedSessions(now);
    await this.sendReminders(now);
    await this.exports.cleanupExpired(now);
  }

  async finalizeOverdueAttempts(now = new Date()) {
    const overdue = await this.prisma.attempt.findMany({
      where: { status: 'IN_PROGRESS', deadlineAt: { lt: new Date(now.getTime() - this.config.answerGraceMs) } },
      select: { id: true, sessionId: true },
      take: 500,
    });
    const sessions = new Set<string>();
    for (const attempt of overdue) {
      const done = await this.prisma.$transaction((tx) => this.grading.finalizeInTx(tx, attempt.id, 'TIMEOUT'));
      if (done) sessions.add(attempt.sessionId);
    }
    for (const sessionId of sessions) await this.grading.afterFinalize(sessionId);
    return overdue.length;
  }

  private async publishClosedSessions(now: Date) {
    const sessions = await this.prisma.assessmentSession.findMany({
      where: { cancelledAt: null, resultsPublishedAt: null, scoreVisibility: 'AFTER_ALL_DONE', endsAt: { lte: now } },
      select: { id: true },
      take: 100,
    });
    for (const session of sessions) await this.grading.afterFinalize(session.id);
  }

  private async sendReminders(now: Date) {
    const sessions = await this.prisma.assessmentSession.findMany({
      where: {
        cancelledAt: null,
        reminderSentAt: null,
        startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_BEFORE_MS) },
      },
      include: { assignments: { where: { removedAt: null }, select: { studentId: true } } },
      take: 100,
    });
    for (const session of sessions) {
      const claimed = await this.prisma.assessmentSession.updateMany({
        where: { id: session.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (claimed.count === 0) continue;
      await this.notifications.notify(
        session.assignments.map((assignment) => assignment.studentId),
        {
          type: 'TEST_STARTING_SOON',
          title: `Test tez orada boshlanadi: ${session.title}`,
          body: `Boshlanish vaqti: ${formatDateTime(session.startsAt)}.`,
          link: `/student/sessions/${session.id}`,
        },
      );
    }
  }
}
