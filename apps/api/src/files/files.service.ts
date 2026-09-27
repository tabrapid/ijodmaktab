import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Response } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole, isStaff } from '../common/auth-user.js';
import { badRequest, notFound } from '../common/errors.js';
import { StorageService } from '../common/storage.service.js';
import { AppConfig } from '../config/app-config.js';
import type { UploadedFileData } from '../common/uploaded-file.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const FILE_MAX_BYTES = 10 * 1024 * 1024;

/** Portfolio yozuviga biriktirilmagan yuklama shu muddatdan keyin o‘chiriladi (almashtirilgan yoki tashlab ketilgan dalil). */
const ORPHAN_TTL_MS = 24 * 60 * 60_000;
/** Karantindagi fayllar tekshirish uchun uzoqroq saqlanadi. */
const QUARANTINE_TTL_MS = 30 * 24 * 60 * 60_000;

/** Ruxsat etilgan turlar — haqiqiy mazmun (magic bytes) bo‘yicha aniqlanadi, kengaytma bo‘yicha emas. */
const ALLOWED: Record<string, { mime: string; inline: boolean }> = {
  pdf: { mime: 'application/pdf', inline: false },
  png: { mime: 'image/png', inline: true },
  jpg: { mime: 'image/jpeg', inline: true },
  webp: { mime: 'image/webp', inline: true },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false },
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger('Files');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  @Interval(60 * 60_000)
  async hourly() {
    if (!this.config.backgroundJobs) return;
    try {
      await this.cleanupOrphans();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.stack : String(error));
    }
  }

  /**
   * Hech bir portfolio yozuviga biriktirilmagan eski fayllarni ombordan o‘chiradi (yozuv “o‘chirilgan” deb belgilanadi).
   * Joriy profil rasmlari yetim hisoblanmaydi.
   */
  async cleanupOrphans(now = new Date()) {
    const orphans = await this.prisma.fileAsset.findMany({
      where: {
        deletedAt: null,
        portfolioItems: { none: {} },
        avatarOf: null,
        OR: [
          { status: 'CLEAN', createdAt: { lt: new Date(now.getTime() - ORPHAN_TTL_MS) } },
          { status: 'QUARANTINED', createdAt: { lt: new Date(now.getTime() - QUARANTINE_TTL_MS) } },
        ],
      },
      select: { id: true, storageKey: true, status: true },
      take: 500,
    });
    for (const file of orphans) {
      await this.storage.remove(file.status === 'CLEAN' ? 'files' : 'quarantine', file.storageKey);
      await this.prisma.fileAsset.update({ where: { id: file.id }, data: { deletedAt: now } });
    }
    if (orphans.length) await this.audit.log('file.orphans_removed', null, { count: orphans.length }, { actor: null });
    return orphans.length;
  }

  /**
   * Faylni yopiq omborga saqlaydi. Hajmi va haqiqiy turi tekshiriladi; ruxsat etilmagan
   * yoki turi aniqlanmagan fayl karantinga olinadi va ishlatilmaydi.
   */
  async upload(viewer: AuthUser, file: UploadedFileData | undefined) {
    if (!file) throw badRequest('NO_FILE', 'Faylni tanlang.');
    if (file.size > FILE_MAX_BYTES) throw badRequest('FILE_TOO_LARGE', 'Fayl hajmi 10 MB dan oshmasligi kerak.');
    const detected = await fileTypeFromBuffer(file.buffer);
    const allowed = detected ? ALLOWED[detected.ext] : undefined;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    // Yo‘l ajratuvchilari va boshqaruv belgilari fayl nomidan olib tashlanadi.
    // eslint-disable-next-line no-control-regex
    const originalName = file.originalname.replace(/[\\/\u0000-\u001F]/g, '_').slice(0, 200) || 'fayl';

    if (!allowed) {
      const key = `${randomUUID()}.bin`;
      await this.storage.write('quarantine', key, file.buffer);
      const quarantined = await this.prisma.fileAsset.create({
        data: {
          ownerId: viewer.id,
          storageKey: key,
          originalName,
          mimeType: detected?.mime ?? 'application/octet-stream',
          sizeBytes: file.size,
          sha256,
          status: 'QUARANTINED',
        },
      });
      await this.audit.log(
        'file.quarantined',
        { type: 'FileAsset', id: quarantined.id },
        {
          originalName,
          detected: detected?.ext ?? null,
        },
      );
      throw badRequest(
        'FILE_TYPE_NOT_ALLOWED',
        'Bu turdagi fayl qabul qilinmaydi (ruxsat etilgan: PDF, JPG, PNG, WEBP, DOCX). Fayl karantinga olindi.',
      );
    }

    const key = `${randomUUID()}.${detected!.ext}`;
    await this.storage.write('files', key, file.buffer);
    const asset = await this.prisma.fileAsset.create({
      data: {
        ownerId: viewer.id,
        storageKey: key,
        originalName,
        mimeType: allowed.mime,
        sizeBytes: file.size,
        sha256,
      },
    });
    await this.audit.log('file.uploaded', { type: 'FileAsset', id: asset.id }, { originalName, size: file.size });
    return { id: asset.id, originalName: asset.originalName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes };
  }

  /**
   * Faylga kirish: egasi yoki fayl biriktirilgan portfolio yozuvini ko‘ra oladigan xodim
   * (portfolio ko‘rinish qoidalari bilan bir xil: tekshiruvchi — har doim; boshqa xodim —
   * “maktab xodimlari” ko‘rinishidagi yozuvda, o‘quvchi yozuvi bo‘lsa uni o‘qitadigan xodim).
   * Kimningdir joriy profil rasmi bo‘lgan faylni esa tizimga kirgan har bir foydalanuvchi ko‘radi.
   */
  private async canRead(viewer: AuthUser, fileId: string, ownerId: string, isAvatar: boolean) {
    if (isAvatar) return true;
    if (ownerId === viewer.id) return true;
    if (hasRole(viewer, 'SUPER_ADMIN', 'DEPUTY')) return true;
    if (!isStaff(viewer)) return false;
    const items = await this.prisma.portfolioItem.findMany({
      where: { evidenceFileId: fileId },
      select: { ownerId: true, visibility: true, owner: { select: { roles: { select: { role: true } } } } },
    });
    for (const item of items) {
      const ownerIsStudent = item.owner.roles.some((entry) => entry.role === 'STUDENT');
      if (!ownerIsStudent) {
        if (item.visibility === 'STAFF') return true;
        continue;
      }
      if (!(await this.access.canViewStudent(viewer, item.ownerId))) continue;
      if (item.visibility === 'STAFF') return true;
      const homeroom = await this.access.homeroomClassIds(viewer.id);
      const isHomeroomOfOwner =
        homeroom.length > 0 &&
        (await this.prisma.enrollment.count({
          where: { studentId: item.ownerId, classId: { in: homeroom }, endsOn: null },
        })) > 0;
      if (isHomeroomOfOwner) return true;
    }
    return false;
  }

  async download(viewer: AuthUser, id: string, res: Response) {
    const asset = await this.prisma.fileAsset.findUnique({
      where: { id },
      include: { avatarOf: { select: { id: true } } },
    });
    const isAvatar = Boolean(asset?.avatarOf);
    if (
      !asset ||
      asset.deletedAt ||
      asset.status !== 'CLEAN' ||
      !(await this.canRead(viewer, id, asset.ownerId, isAvatar))
    ) {
      throw notFound('Fayl');
    }
    const ext = asset.storageKey.split('.').pop() ?? '';
    const inline = isAvatar || (ALLOWED[ext]?.inline ?? false);
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
    );
    // Profil rasmi almashganda manzili ham o‘zgaradi, shuning uchun uni qisqa muddat keshlash xavfsiz.
    res.setHeader('Cache-Control', isAvatar ? 'private, max-age=3600' : 'private, no-store');
    this.storage.stream('files', asset.storageKey).pipe(res);
  }
}
