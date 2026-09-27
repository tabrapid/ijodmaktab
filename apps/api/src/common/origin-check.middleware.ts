import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF himoyasining qo‘shimcha qatlami: holatni o‘zgartiruvchi so‘rov boshqa saytdan kelsa rad etiladi.
 * (Asosiy himoya — SameSite=Lax cookie va faqat JSON qabul qilinishi.)
 */
export function originCheckMiddleware(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (SAFE_METHODS.has(req.method) || !origin || allowed.has(origin)) return next();
    res.status(403).json({
      statusCode: 403,
      code: 'FORBIDDEN_ORIGIN',
      message: 'So‘rov ruxsat etilmagan manbadan yuborilgan.',
    });
  };
}
