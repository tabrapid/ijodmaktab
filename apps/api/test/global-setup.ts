import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import pg from 'pg';

/**
 * E2E testlar uchun alohida bazani tozalab, migratsiyalarni qo‘llaydi.
 * Xavfsizlik: faqat nomi “_test” bilan tugaydigan baza tozalanadi.
 */
export default async function setup() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://ijod:ijod@localhost:5432/ijod_test?schema=public';
  const database = new URL(url).pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL “_test” bilan tugaydigan baza bo‘lishi kerak (hozir: ${database})`);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.end();
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
