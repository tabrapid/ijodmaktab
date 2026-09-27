import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AVATAR_MAX_BYTES, AVATAR_MAX_PIXELS, AVATAR_MIME_TYPES } from '@ijod/shared';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { badRequest } from '../common/errors.js';
import { StorageService } from '../common/storage.service.js';
import type { UploadedFileData } from '../common/uploaded-file.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';

/** Profil rasmi o‘lchami (kvadrat, piksel). */
const AVATAR_SIZE = 512;
/** Harakatlanuvchi PNG (APNG) ham PNG hisoblanadi — faqat birinchi kadri olinadi. */
const AVATAR_ALLOWED = new Set<string>([...AVATAR_MIME_TYPES, 'image/apng']);

/** Juda katta o‘lchamli rasmlar (xotirani to‘ldirish hujumi) qayta ishlanmaydi. */
const tooManyPixels = () =>
  badRequest(
    'AVATAR_TOO_LARGE',
    'Rasm o‘lchami juda katta (40 megapikseldan oshmasin). Rasmni kichraytirib yoki skrinshot qilib yuklang.',
  );
const unreadable = () =>
  badRequest('AVATAR_UNREADABLE', 'Rasmni o‘qib bo‘lmadi. Fayl buzilmaganini tekshiring yoki boshqa rasm tanlang.');

/**
 * Profil rasmlari: yuklangan rasm tekshiriladi, 512×512 WEBP ga o‘giriladi (EXIF va boshqa
 * metama’lumotlar olib tashlanadi, joylashuv kabi shaxsiy ma’lumot saqlanmaydi) va yopiq omborga yoziladi.
 */
@Injectable()
export class AvatarService {
  private readonly logger = new Logger('Avatars');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  /** O‘z profil rasmini yuklash yoki almashtirish; javob — `GET /auth/me` bilan bir xil. */
  async upload(user: AuthUser, file: UploadedFileData | undefined) {
    if (!file) throw badRequest('NO_FILE', 'Rasmni tanlang.');
    if (file.size > AVATAR_MAX_BYTES) throw badRequest('FILE_TOO_LARGE', 'Rasm hajmi 5 MB dan oshmasligi kerak.');
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !AVATAR_ALLOWED.has(detected.mime)) {
      throw badRequest(
        'AVATAR_TYPE_NOT_ALLOWED',
        'Profil rasmi uchun faqat JPG, PNG yoki WEBP formatidagi rasm yuklang.',
      );
    }

    const data = await this.process(file.buffer);

    const key = `${randomUUID()}.webp`;
    await this.storage.write('files', key, data);
    let previousKey: string | null = null;
    let fileId: string;
    try {
      ({ fileId, previousKey } = await this.prisma.$transaction(async (tx) => {
        // Avval foydalanuvchi qatori qulflanadi (`detach`), keyin unga bog‘liq yozuvlar yaratiladi.
        const previous = await this.detach(tx, user.id);
        const asset = await tx.fileAsset.create({
          data: {
            ownerId: user.id,
            storageKey: key,
            originalName: 'avatar.webp',
            mimeType: 'image/webp',
            sizeBytes: data.length,
            sha256: createHash('sha256').update(data).digest('hex'),
          },
        });
        await tx.user.update({ where: { id: user.id }, data: { avatarFileId: asset.id } });
        await this.audit.log(
          'user.avatar_updated',
          { type: 'User', id: user.id },
          { fileId: asset.id, sizeBytes: data.length, replaced: previous !== null },
          { tx },
        );
        return { fileId: asset.id, previousKey: previous };
      }));
    } catch (error) {
      await this.storage.remove('files', key);
      throw error;
    }
    await this.removeBlob(previousKey);
    return this.auth.me({ ...user, avatarFileId: fileId });
  }

  /** O‘z profil rasmini olib tashlash; javob — `GET /auth/me` bilan bir xil. */
  async removeOwn(user: AuthUser) {
    await this.remove(user.id, false);
    return this.auth.me({ ...user, avatarFileId: null });
  }

  /**
   * Profil rasmini olib tashlaydi (fayl yozuvi va ombordagi fayl). Rasm bo‘lmasa hech narsa
   * qilinmaydi. `moderated` — rasmni boshqa foydalanuvchi (rahbariyat yoki administrator) olib tashladi.
   */
  async remove(userId: string, moderated: boolean) {
    const previousKey = await this.prisma.$transaction(async (tx) => {
      const key = await this.detach(tx, userId);
      if (key !== null) {
        await tx.user.update({ where: { id: userId }, data: { avatarFileId: null } });
        await this.audit.log('user.avatar_removed', { type: 'User', id: userId }, { moderated }, { tx });
      }
      return key;
    });
    await this.removeBlob(previousKey);
    return previousKey !== null;
  }

  /**
   * Profil rasmi yozuvini o‘chiradi va ombordagi fayl kalitini qaytaradi. Tranzaksiyadagi BIRINCHI amal
   * bo‘lishi kerak: foydalanuvchi qatorini qulflaydi, shunda bir vaqtdagi yuklash, olib tashlash va hisobni
   * o‘chirish navbat bilan bajariladi (aks holda Postgres o‘zaro qulflanishni aniqlab, birini bekor qiladi).
   * Ombordagi faylni tranzaksiya muvaffaqiyatli yakunlangach `removeBlob` bilan o‘chirish kerak.
   */
  async detach(tx: Tx, userId: string): Promise<string | null> {
    // FOR UPDATE: `avatarFileId` noyob ustun, uni o‘zgartirish kalit yangilanishi hisoblanadi.
    const rows = await tx.$queryRaw<{ avatarFileId: string | null }[]>`
      SELECT "avatarFileId" FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    const fileId = rows[0]?.avatarFileId;
    if (!fileId) return null;
    const file = await tx.fileAsset.findUnique({ where: { id: fileId }, select: { storageKey: true } });
    // Yozuv o‘chirilganda foydalanuvchidagi havola ham avtomatik bo‘shatiladi (onDelete: SetNull).
    await tx.fileAsset.deleteMany({ where: { id: fileId } });
    return file?.storageKey ?? null;
  }

  /** Rasmni aylantiradi, 512×512 ga kesadi va WEBP ga o‘giradi (metama’lumotlar saqlanmaydi). */
  private async process(buffer: Buffer): Promise<Buffer> {
    let pixels: number;
    try {
      // Faqat sarlavha o‘qiladi: katta rasm to‘liq ochilmasdan oldin rad etiladi.
      const { width = 0, height = 0, pageHeight } = await sharp(buffer).metadata();
      pixels = width * (pageHeight ?? height);
    } catch {
      throw unreadable();
    }
    if (pixels > AVATAR_MAX_PIXELS) throw tooManyPixels();
    try {
      return await sharp(buffer, { limitInputPixels: AVATAR_MAX_PIXELS })
        .autoOrient()
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: sharp.strategy.attention })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (error) {
      if (error instanceof Error && /pixel limit/i.test(error.message)) throw tooManyPixels();
      throw unreadable();
    }
  }

  async removeBlob(storageKey: string | null) {
    if (!storageKey) return;
    try {
      await this.storage.remove('files', storageKey);
    } catch (error) {
      this.logger.warn(`Eski profil rasmini o‘chirib bo‘lmadi (${storageKey}): ${String(error)}`);
    }
  }
}
