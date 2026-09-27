import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Testlar alohida bazada, fon vazifalarisiz va vaqtinchalik fayl omborida ishlaydi.
if (existsSync('.env')) process.loadEnvFile('.env');
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://ijod:ijod@localhost:5432/ijod_test?schema=public';
process.env.BACKGROUND_JOBS = 'off';
process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.STORAGE_DIR = join(tmpdir(), 'ijod-e2e-storage');
process.env.ANSWER_GRACE_SECONDS = '0';
