import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/** Foydalanuvchiga tushunarli (o‘zbekcha) xabar va mashina uchun kod bilan xatolik. */
export class AppError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, details?: unknown) {
    super({ statusCode: status, code, message, details } satisfies ErrorBody, status);
  }
}

/**
 * Ruxsat berilmagan resurs uchun ham 404 qaytariladi: ID ni almashtirib boshqa odamning
 * ma’lumoti borligini aniqlab bo‘lmaydi.
 */
export const notFound = (what = 'Yozuv') => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} topilmadi.`);

export const forbidden = (message = 'Bu amal uchun ruxsatingiz yo‘q.', code = 'FORBIDDEN') =>
  new AppError(HttpStatus.FORBIDDEN, code, message);

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.BAD_REQUEST, code, message, details);

export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.CONFLICT, code, message, details);

export const unauthorized = (message = 'Tizimga kirish talab qilinadi.', code = 'UNAUTHORIZED') =>
  new AppError(HttpStatus.UNAUTHORIZED, code, message);

export const tooManyRequests = (message: string, code = 'TOO_MANY_REQUESTS') =>
  new AppError(HttpStatus.TOO_MANY_REQUESTS, code, message);
