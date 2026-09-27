import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole } from '../common/auth-user.js';
import { badRequest, notFound } from '../common/errors.js';
import { StorageService } from '../common/storage.service.js';
import type { UploadedFileData } from '../common/uploaded-file.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const FILE_MAX_BYTES = 10 * 1024 * 1024;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

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
      await this.audit.log('file.quarantined', { type: 'FileAsset', id: quarantined.id }, {
        originalName,
        detected: detected?.ext ?? null,
      });
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

  /** Faylga kirish: egasi yoki fayl biriktirilgan portfolio yozuvini ko‘ra oladigan xodim. */
  private async canRead(viewer: AuthUser, fileId: string, ownerId: string) {
    if (ownerId === viewer.id) return true;
    if (hasRole(viewer, 'SUPER_ADMIN', 'DEPUTY')) return true;
    const items = await this.prisma.portfolioItem.findMany({
      where: { evidenceFileId: fileId },
      select: { ownerId: true, visibility: true },
    });
    for (const item of items) {
      if (await this.access.canViewStudent(viewer, item.ownerId)) {
        const homeroom = await this.access.homeroomClassIds(viewer.id);
        const isHomeroomOfOwner =
          homeroom.length > 0 &&
          (await this.prisma.enrollment.count({ where: { studentId: item.ownerId, classId: { in: homeroom }, endsOn: null } })) > 0;
        if (item.visibility === 'STAFF' || isHomeroomOfOwner) return true;
      }
    }
    return false;
  }

  async download(viewer: AuthUser, id: string, res: Response) {
    const asset = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt || asset.status !== 'CLEAN' || !(await this.canRead(viewer, id, asset.ownerId))) {
      throw notFound('Fayl');
    }
    const ext = asset.storageKey.split('.').pop() ?? '';
    const inline = ALLOWED[ext]?.inline ?? false;
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    this.storage.stream('files', asset.storageKey).pipe(res);
  }
}
