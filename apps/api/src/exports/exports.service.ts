import { Injectable, Logger } from '@nestjs/common';
import { EXPORT_KIND_LABELS, fullName, type Role, type createExportSchema } from '@ijod/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import type { Viewer } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { conflict, forbidden, notFound } from '../common/errors.js';
import { StorageService } from '../common/storage.service.js';
import { XLSX_MIME } from '../common/xlsx.js';
import type { ExportJob, Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildProtocolDocx, buildResultsWorkbook } from '../results/report-builders.js';
import { ResultsService } from '../results/results.service.js';

type CreateExportInput = z.output<typeof createExportSchema>;

/** Tayyor fayl havolasi amal qilish muddati. */
export const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const FORMATS = {
  SESSION_RESULTS_XLSX: { extension: 'xlsx', mime: XLSX_MIME, prefix: 'natijalar' },
  SESSION_REPORT_DOCX: { extension: 'docx', mime: DOCX_MIME, prefix: 'bayonnoma' },
} as const;

/**
 * Eksport markazi: fayllar navbatda tayyorlanadi, havola vaqtinchalik. Huquq eksport
 * yaratishda, tayyorlashda va yuklab olishda qayta tekshiriladi — ruxsat bekor qilingach
 * eski havola ishlamaydi.
 */
@Injectable()
export class ExportsService {
  private readonly logger = new Logger('Exports');
  private readonly processing = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly results: ResultsService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private view(job: ExportJob) {
    return {
      id: job.id,
      kind: job.kind,
      kindLabel: EXPORT_KIND_LABELS[job.kind],
      sessionId: job.sessionId,
      status: job.status,
      rowCount: job.rowCount,
      fileName: job.fileName,
      error: job.error,
      params: job.params,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      expiresAt: job.expiresAt,
    };
  }

  /** Eksport tugmasi qatorlar sonini oldindan ko‘rsatishi uchun. */
  async previewCount(viewer: AuthUser, input: CreateExportInput) {
    await this.results.assertCanView(viewer, input.sessionId);
    const session = await this.prisma.assessmentSession.findUniqueOrThrow({ where: { id: input.sessionId } });
    const limit = await this.results.viewerClassLimit(viewer, session);
    const data = await this.results.build(input.sessionId, input.filters, limit);
    return { rowCount: data.rows.length };
  }

  async create(viewer: AuthUser, input: CreateExportInput) {
    await this.results.assertCanView(viewer, input.sessionId);
    const job = await this.prisma.exportJob.create({
      data: {
        requestedById: viewer.id,
        kind: input.kind,
        sessionId: input.sessionId,
        params: { filters: input.filters } as Prisma.InputJsonValue,
      },
    });
    await this.audit.log(
      'export.requested',
      { type: 'ExportJob', id: job.id },
      {
        kind: input.kind,
        sessionId: input.sessionId,
        filters: input.filters,
      },
    );
    setImmediate(() => void this.process(job.id));
    return this.view(job);
  }

  private async requester(userId: string): Promise<Viewer & { fullName: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true } });
    if (user.status !== 'ACTIVE') throw forbidden('Hisob faol emas.');
    return { id: user.id, roles: user.roles.map((role) => role.role as Role), fullName: fullName(user) };
  }

  /** Navbatdagi eksportni tayyorlaydi (fon vazifasi). */
  async process(jobId: string) {
    if (this.processing.has(jobId)) return;
    this.processing.add(jobId);
    try {
      const claimed = await this.prisma.exportJob.updateMany({
        where: { id: jobId, status: 'QUEUED' },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
      if (claimed.count === 0) return;
      const job = await this.prisma.exportJob.findUniqueOrThrow({ where: { id: jobId } });
      try {
        const requester = await this.requester(job.requestedById);
        const session = await this.results.assertCanView(requester, job.sessionId!);
        const limit = await this.results.viewerClassLimit(requester, session);
        const filters = (job.params as { filters?: Record<string, unknown> }).filters ?? {};
        const data = await this.results.build(session.id, filters, limit);
        const school = await this.prisma.school.findUnique({ where: { id: 1 } });
        const meta = {
          schoolName: school?.name ?? 'Ijod maktabi',
          generatedBy: requester.fullName,
          generatedAt: new Date(),
        };
        const format = FORMATS[job.kind];
        const buffer =
          job.kind === 'SESSION_RESULTS_XLSX'
            ? await buildResultsWorkbook(data, meta)
            : await buildProtocolDocx(data, meta);
        const key = `${job.id}.${format.extension}`;
        await this.storage.write('exports', key, buffer);
        const date = new Date().toISOString().slice(0, 10);
        await this.prisma.exportJob.update({
          where: { id: job.id },
          data: {
            status: 'READY',
            fileKey: key,
            fileName: `${format.prefix}-${slug(session.title)}-${date}.${format.extension}`,
            rowCount: data.rows.length,
            finishedAt: new Date(),
            expiresAt: new Date(Date.now() + EXPORT_TTL_MS),
          },
        });
        await this.notifications.notify([job.requestedById], {
          type: 'EXPORT_READY',
          title: `Eksport tayyor: ${EXPORT_KIND_LABELS[job.kind]}`,
          body: session.title,
          link: `/exports?highlight=${job.id}`,
        });
      } catch (error) {
        this.logger.error(`Eksport ${jobId} bajarilmadi: ${error instanceof Error ? error.stack : String(error)}`);
        await this.prisma.exportJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            error:
              error instanceof Error && 'getResponse' in error
                ? 'Ruxsat yo‘q yoki sessiya topilmadi.'
                : 'Faylni tayyorlashda xatolik yuz berdi.',
          },
        });
      }
    } finally {
      this.processing.delete(jobId);
    }
  }

  async list(viewer: AuthUser) {
    const jobs = await this.prisma.exportJob.findMany({
      where: { requestedById: viewer.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return jobs.map((job) => this.view(job));
  }

  async get(viewer: AuthUser, id: string) {
    const job = await this.prisma.exportJob.findUnique({ where: { id } });
    if (!job || job.requestedById !== viewer.id) throw notFound('Eksport');
    return this.view(job);
  }

  async download(viewer: AuthUser, id: string, res: Response) {
    const job = await this.prisma.exportJob.findUnique({ where: { id } });
    if (!job || job.requestedById !== viewer.id) throw notFound('Eksport');
    if (job.status !== 'READY' || !job.fileKey) throw conflict('NOT_READY', 'Fayl hali tayyor emas.');
    if (!job.expiresAt || job.expiresAt.getTime() < Date.now()) {
      throw conflict('EXPIRED', 'Havola muddati tugagan. Eksportni qayta yarating.');
    }
    // Yuklab olishda huquq qayta tekshiriladi.
    try {
      await this.results.assertCanView(viewer, job.sessionId!);
    } catch (error) {
      await this.audit.log('export.download_denied', { type: 'ExportJob', id });
      throw error;
    }
    if (!(await this.storage.exists('exports', job.fileKey))) throw notFound('Fayl');
    await this.prisma.exportJob.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
    await this.audit.log(
      'export.downloaded',
      { type: 'ExportJob', id },
      {
        kind: job.kind,
        sessionId: job.sessionId,
        params: job.params,
        rowCount: job.rowCount,
      },
    );
    const format = FORMATS[job.kind];
    res.setHeader('Content-Type', format.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName(job.fileName ?? job.fileKey)}"; filename*=UTF-8''${encodeURIComponent(job.fileName ?? job.fileKey)}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    this.storage.stream('exports', job.fileKey).pipe(res);
  }

  /** Muddati o‘tgan fayllar o‘chiriladi. */
  async cleanupExpired(now = new Date()) {
    const jobs = await this.prisma.exportJob.findMany({
      where: { status: 'READY', expiresAt: { lt: now } },
      take: 100,
    });
    for (const job of jobs) {
      if (job.fileKey) await this.storage.remove('exports', job.fileKey);
      await this.prisma.exportJob.update({ where: { id: job.id }, data: { status: 'EXPIRED' } });
    }
  }

  /** Server qayta ishga tushganda tugallanmagan eksportlar navbatga qaytariladi. */
  async resumePending() {
    await this.prisma.exportJob.updateMany({ where: { status: 'RUNNING' }, data: { status: 'QUEUED' } });
    const queued = await this.prisma.exportJob.findMany({ where: { status: 'QUEUED' }, select: { id: true } });
    for (const job of queued) void this.process(job.id);
  }
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[‘’'ʻʼ`]/g, '')
      .replace(/[^a-z0-9а-яёўқғҳ]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'sessiya'
  );
}

const asciiName = (value: string) => value.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
