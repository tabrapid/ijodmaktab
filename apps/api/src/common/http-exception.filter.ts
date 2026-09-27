import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import type { ErrorBody } from './errors.js';

const GENERIC_MESSAGES: Record<number, { code: string; message: string }> = {
  400: { code: 'BAD_REQUEST', message: 'So‘rov noto‘g‘ri.' },
  401: { code: 'UNAUTHORIZED', message: 'Tizimga kirish talab qilinadi.' },
  403: { code: 'FORBIDDEN', message: 'Bu amal uchun ruxsatingiz yo‘q.' },
  404: { code: 'NOT_FOUND', message: 'So‘ralgan manzil yoki yozuv topilmadi.' },
  405: { code: 'METHOD_NOT_ALLOWED', message: 'Bu amal qo‘llab-quvvatlanmaydi.' },
  409: { code: 'CONFLICT', message: 'Amal joriy holat bilan ziddiyatli.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'Yuborilgan ma’lumot yoki fayl hajmi juda katta.' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Fayl yoki ma’lumot turi qo‘llab-quvvatlanmaydi.' },
  429: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring.',
  },
};

interface ServerErrorRecord {
  at: string;
  method: string;
  path: string;
  message: string;
}

/** So‘nggi server xatoliklari (xotirada, super admin paneli uchun). */
const recentErrors: ServerErrorRecord[] = [];
export const recentServerErrors = () => [...recentErrors].reverse();

/**
 * Barcha xatoliklarni yagona ko‘rinishga keltiradi: { statusCode, code, message, details }.
 * Ichki tafsilotlar (SQL, stack) foydalanuvchiga ko‘rsatilmaydi, faqat jurnalga yoziladi.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      recentErrors.push({
        at: new Date().toISOString(),
        method: request.method,
        path: request.originalUrl?.split('?')[0] ?? '',
        message: exception instanceof Error ? exception.message.slice(0, 300) : String(exception).slice(0, 300),
      });
      if (recentErrors.length > 50) recentErrors.shift();
    }
    if (!response.headersSent) response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof ZodError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        message: exception.issues[0]?.message ?? 'Ma’lumotlar noto‘g‘ri kiritilgan.',
        details: exception.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return { statusCode: 409, code: 'DUPLICATE', message: 'Bunday yozuv allaqachon mavjud.' };
        case 'P2003':
        case 'P2014':
          return {
            statusCode: 409,
            code: 'HAS_DEPENDENCIES',
            message: 'Yozuv boshqa ma’lumotlar bilan bog‘langan, shuning uchun amal bajarilmadi.',
          };
        case 'P2025':
          return { statusCode: 404, code: 'NOT_FOUND', message: 'Yozuv topilmadi.' };
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object' && response && 'code' in response && 'message' in response) {
        return response as ErrorBody;
      }
      const generic = GENERIC_MESSAGES[status] ?? {
        code: 'ERROR',
        message: 'So‘rovni bajarishda xatolik yuz berdi.',
      };
      return { statusCode: status, ...generic };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Serverda kutilmagan xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko‘ring.',
    };
  }
}
