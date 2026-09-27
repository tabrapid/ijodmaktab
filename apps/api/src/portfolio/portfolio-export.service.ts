import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  ACHIEVEMENT_LEVEL_LABELS,
  PORTFOLIO_CATEGORIES,
  PORTFOLIO_ITEM_TYPE_LABELS,
  PORTFOLIO_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatInternalId,
  fullName,
  isStructuredPortfolioType,
  normalizeApostrophes,
  portfolioCategoryOf,
  portfolioDetailsLines,
  type AchievementLevel,
  type PortfolioCategory,
  type PortfolioItemType,
  type PortfolioStatus,
  type portfolioEvidenceExportQuerySchema,
} from '@ijod/shared';
import type { Response } from 'express';
import JSZip from 'jszip';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { AppError, badRequest, notFound } from '../common/errors.js';
import { StorageService } from '../common/storage.service.js';
import { addTableSheet, newWorkbook, workbookToBuffer } from '../common/xlsx.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PortfolioAccess } from './portfolio-access.js';
import { ownerFacts, ownerSelect } from './portfolio-common.js';

type ExportQuery = z.output<typeof portfolioEvidenceExportQuerySchema>;

/** Arxivdagi fayllar umumiy hajmi chegarasi. */
export const EVIDENCE_ZIP_MAX_BYTES = 200 * 1024 * 1024;

/** Arxiv ichidagi papkalar (bo‘limlar bo‘yicha). */
const FOLDERS: Record<PortfolioCategory, string> = {
  CERTIFICATES: 'Sertifikatlar',
  OLYMPIADS: 'Olimpiadalar',
  CREATIVE: 'Ijodiy ishlar',
  OTHER: 'Boshqa',
};

const exportInclude = {
  reviewer: { select: { lastName: true, firstName: true, middleName: true } },
  subject: { select: { name: true } },
  evidenceFile: {
    select: { id: true, originalName: true, sizeBytes: true, storageKey: true, status: true, deletedAt: true },
  },
} satisfies Prisma.PortfolioItemInclude;

/**
 * Fayl nomi uchun xavfsiz matn: yo‘l ajratuvchilari, boshqaruv va Windows’da taqiqlangan belgilar
 * olib tashlanadi, o‘zbekcha apostroflar bitta ko‘rinishga keltiriladi, tire “-”, bo‘shliqlar “_” bo‘ladi.
 */
export function safeFileSegment(value: string, max = 80) {
  const cleaned = normalizeApostrophes(value.normalize('NFC'))
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F/\\:*?"<>|“”„«»]/g, '')
    .replace(/\s*[—–]\s*/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '');
  return (cleaned.slice(0, max).replace(/[._]+$/, '') || 'fayl').trim();
}

/** Portfolio dalillarini (sertifikatlar, diplomlar) ZIP arxiv qilib beradi. */
@Injectable()
export class PortfolioExportService {
  private readonly logger = new Logger('PortfolioExport');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly portfolioAccess: PortfolioAccess,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ruxsat: egasi, rahbariyat va o‘quvchining sinf rahbari. `approved` — faqat tasdiqlangan yozuvlar;
   * `all` — ko‘rish mumkin bo‘lgan barcha yozuvlar (qoralamalar faqat egasiga).
   */
  async evidenceZip(viewer: AuthUser, ownerId: string, query: ExportQuery, res: Response) {
    const scope = await this.portfolioAccess.scope(viewer);
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: ownerSelect });
    if (!owner) throw notFound('Foydalanuvchi');
    const self = owner.id === viewer.id;
    if (!self && !this.portfolioAccess.canReviewOwner(scope, ownerFacts(owner))) throw notFound('Foydalanuvchi');

    const status: Prisma.PortfolioItemWhereInput['status'] =
      query.scope === 'approved' ? 'APPROVED' : self ? undefined : { not: 'DRAFT' };
    const found = await this.prisma.portfolioItem.findMany({
      where: { ownerId, status },
      include: exportInclude,
      orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    if (found.length === 0) {
      throw badRequest(
        'NOTHING_TO_EXPORT',
        query.scope === 'approved'
          ? 'Tasdiqlangan yozuvlar yo‘q — yuklab olinadigan narsa topilmadi.'
          : 'Portfolio yozuvlari yo‘q — yuklab olinadigan narsa topilmadi.',
      );
    }
    // Bo‘limlar tartibida: sertifikatlar, olimpiadalar, ijodiy ishlar, boshqalar.
    const items = PORTFOLIO_CATEGORIES.flatMap((category) =>
      found.filter((item) => portfolioCategoryOf(item.type as PortfolioItemType) === category),
    );

    const width = Math.max(2, String(items.length).length);
    const used = new Set<string>();
    const entries: { path: string; storageKey: string }[] = [];
    let totalBytes = 0;
    const rows: Record<string, string | number | null>[] = [];
    for (const [index, item] of items.entries()) {
      const type = item.type as PortfolioItemType;
      const number = String(index + 1).padStart(width, '0');
      const file = item.evidenceFile;
      let path: string | null = null;
      let note: string | null = null;
      if (file && file.status === 'CLEAN' && !file.deletedAt) {
        if (await this.storage.exists('files', file.storageKey)) {
          const extension = file.storageKey.split('.').pop() ?? 'bin';
          const base = `${FOLDERS[portfolioCategoryOf(type)]}/${number}_${safeFileSegment(PORTFOLIO_ITEM_TYPE_LABELS[type], 30)}_${safeFileSegment(item.title)}`;
          path = `${base}.${extension}`;
          for (let copy = 2; used.has(path.toLowerCase()); copy += 1) path = `${base}_${copy}.${extension}`;
          used.add(path.toLowerCase());
          entries.push({ path, storageKey: file.storageKey });
          totalBytes += file.sizeBytes;
        } else {
          note = 'Fayl omborda topilmadi';
        }
      }
      const summary = isStructuredPortfolioType(type)
        ? portfolioDetailsLines(type, item.details)
            .map((line) => `${line.label}: ${line.value}`)
            .join('; ')
        : (item.result ?? '');
      rows.push({
        index: index + 1,
        type: PORTFOLIO_ITEM_TYPE_LABELS[type],
        title: item.title,
        summary: summary || item.result || '',
        subject: item.subject?.name ?? '',
        organization: item.organization ?? '',
        date: item.date ? formatDate(item.date) : '',
        level: item.level ? ACHIEVEMENT_LEVEL_LABELS[item.level as AchievementLevel] : '',
        status: PORTFOLIO_STATUS_LABELS[item.status as PortfolioStatus],
        reviewer: item.reviewer ? fullName(item.reviewer) : '',
        reviewedAt: item.reviewedAt ? formatDateTime(item.reviewedAt) : '',
        evidence: [path ?? note ?? (file ? 'Fayl mavjud emas' : ''), item.evidenceUrl ?? ''].filter(Boolean).join('; '),
      });
    }
    if (totalBytes > EVIDENCE_ZIP_MAX_BYTES) {
      throw new AppError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'EXPORT_TOO_LARGE',
        'Fayllar hajmi juda katta (200 MB dan ortiq). Faqat tasdiqlangan yozuvlarni yuklab oling yoki fayllarni alohida oching.',
      );
    }

    const workbook = newWorkbook();
    addTableSheet(
      workbook,
      'Ro‘yxat',
      [
        { header: '№', key: 'index', width: 6 },
        { header: 'Turi', key: 'type', width: 18 },
        { header: 'Nomi', key: 'title', width: 40 },
        { header: 'Natija / ma’lumotlar', key: 'summary', width: 48 },
        { header: 'Fan', key: 'subject', width: 20 },
        { header: 'Tashkilot', key: 'organization', width: 30 },
        { header: 'Sana', key: 'date', width: 12 },
        { header: 'Bosqich', key: 'level', width: 12 },
        { header: 'Holat', key: 'status', width: 22 },
        { header: 'Tasdiqlagan', key: 'reviewer', width: 28 },
        { header: 'Tasdiqlangan sana', key: 'reviewedAt', width: 18 },
        { header: 'Fayl yoki havola', key: 'evidence', width: 60 },
      ],
      rows,
    );
    const person = fullName(owner);
    const className = owner.enrollments[0]?.class.name ?? null;
    const info = workbook.addWorksheet('Ma’lumot');
    info.columns = [
      { key: 'label', width: 22 },
      { key: 'value', width: 50 },
    ];
    info.addRows([
      { label: 'F.I.Sh.', value: person },
      { label: 'Ichki ID', value: formatInternalId(owner.internalId) },
      ...(className ? [{ label: 'Sinf', value: className }] : []),
      { label: 'Tanlov', value: query.scope === 'approved' ? 'Faqat tasdiqlangan yozuvlar' : 'Barcha yozuvlar' },
      { label: 'Yozuvlar soni', value: String(items.length) },
      { label: 'Fayllar soni', value: String(entries.length) },
      { label: 'Tayyorlangan', value: formatDateTime(new Date()) },
    ]);
    info.getColumn(1).font = { bold: true };

    const zip = new JSZip();
    for (const entry of entries) {
      zip.file(entry.path, this.storage.stream('files', entry.storageKey), { binary: true });
    }
    zip.file('royxat.xlsx', await workbookToBuffer(workbook));

    await this.audit.log(
      'portfolio.evidence_exported',
      { type: 'User', id: ownerId },
      { ownerId, count: entries.length, items: items.length, scope: query.scope },
    );

    const fileName = `portfolio_${safeFileSegment(`${owner.lastName}_${owner.firstName}`, 60)}_${formatInternalId(owner.internalId)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName(fileName)}"; filename*=UTF-8''${encodeRfc5987(fileName)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    const stream = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'STORE' });
    stream.on('error', (error: Error) => {
      this.logger.error(`ZIP arxivini yaratib bo‘lmadi: ${error.message}`);
      res.destroy(error);
    });
    stream.pipe(res);
  }
}

const asciiName = (value: string) => value.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');

/** RFC 5987: apostrof va qavslar ham kodlanadi. */
const encodeRfc5987 = (value: string) =>
  encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
