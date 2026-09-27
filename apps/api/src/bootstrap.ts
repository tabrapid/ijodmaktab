import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { z } from 'zod';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { originCheckMiddleware } from './common/origin-check.middleware.js';
import { requestContextMiddleware } from './common/request-context.js';
import { AppConfig } from './config/app-config.js';

// Umumiy sxemalarda alohida xabar berilmagan holatlar uchun o‘zbekcha standart xabarlar.
z.config(z.locales.uz());

/** Server va e2e testlar uchun umumiy sozlash. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get(AppConfig);
  app.setGlobalPrefix('api');
  // Veb-ilova (Next.js) so‘rovlarni shu mashinadan proksi qiladi: haqiqiy IP X-Forwarded-For da.
  app.set('trust proxy', config.trustProxy ? true : 'loopback');
  app.use(helmet());
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.use(originCheckMiddleware(config.webOrigins));
  app.enableCors({ origin: config.webOrigins, credentials: true });
  app.useBodyParser('json', { limit: '2mb' });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
