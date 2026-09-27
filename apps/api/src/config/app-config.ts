import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL belgilanmagan'),
  PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  APP_ENCRYPTION_KEY: z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
    message: 'APP_ENCRYPTION_KEY 32 baytlik base64 qiymat bo‘lishi kerak',
  }),
  COOKIE_SECURE: booleanFromEnv,
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  STORAGE_DIR: z.string().default('./storage'),
  ANSWER_GRACE_SECONDS: z.coerce.number().min(0).max(60).default(2),
  /** Sweeper (muddati o‘tgan urinishlarni yakunlash) ishlashi; testlarda o‘chiriladi. */
  BACKGROUND_JOBS: z.enum(['on', 'off']).default('on'),
  TRUST_PROXY: booleanFromEnv,
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Ilova sozlamalari. Muhit o‘zgaruvchilari ishga tushishda bir marta tekshiriladi —
 * noto‘g‘ri qiymat bilan server umuman ishga tushmaydi.
 */
export class AppConfig {
  readonly env: AppEnv['NODE_ENV'];
  readonly databaseUrl: string;
  readonly port: number;
  readonly webOrigins: string[];
  readonly encryptionKey: Buffer;
  readonly cookieSecure: boolean;
  readonly sessionTtlMs: number;
  readonly sessionAbsoluteTtlMs = 7 * 24 * 60 * 60 * 1000;
  readonly storageDir: string;
  readonly answerGraceMs: number;
  readonly backgroundJobs: boolean;
  readonly trustProxy: boolean;

  constructor(source: NodeJS.ProcessEnv = process.env) {
    const parsed = envSchema.safeParse(source);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
      throw new Error(`Muhit sozlamalari noto‘g‘ri:\n${details.join('\n')}`);
    }
    const env = parsed.data;
    this.env = env.NODE_ENV;
    this.databaseUrl = env.DATABASE_URL;
    this.port = env.PORT;
    this.webOrigins = env.WEB_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    this.encryptionKey = Buffer.from(env.APP_ENCRYPTION_KEY, 'base64');
    this.cookieSecure = env.COOKIE_SECURE;
    this.sessionTtlMs = env.SESSION_TTL_HOURS * 60 * 60 * 1000;
    this.storageDir = env.STORAGE_DIR;
    this.answerGraceMs = env.ANSWER_GRACE_SECONDS * 1000;
    this.backgroundJobs = env.BACKGROUND_JOBS === 'on';
    this.trustProxy = env.TRUST_PROXY;
  }
}
