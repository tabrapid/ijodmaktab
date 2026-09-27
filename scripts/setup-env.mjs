#!/usr/bin/env node
/**
 * Mahalliy ishlab chiqish uchun .env fayllarini tayyorlaydi (macOS, Linux va Windows’da bir xil ishlaydi):
 *  - apps/api/.env va apps/web/.env bo‘lmasa, .env.example dan nusxa oladi;
 *  - apps/api/.env dagi APP_ENCRYPTION_KEY yaroqsiz bo‘lsa (masalan, namunadagi qiymat), yangi kalit yozadi.
 *
 * Mavjud fayllar va yaroqli kalit o‘zgartirilmaydi: kalit almashsa, ikki bosqichli kirish (TOTP)
 * sirlarini ochib bo‘lmay qoladi.
 *
 * Ishga tushirish: pnpm env:setup
 */
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const app of ['api', 'web']) {
  const target = join(root, 'apps', app, '.env');
  if (existsSync(target)) {
    console.log(`✓ apps/${app}/.env mavjud — o‘zgartirilmadi`);
  } else {
    copyFileSync(join(root, 'apps', app, '.env.example'), target);
    console.log(`+ apps/${app}/.env yaratildi (.env.example asosida)`);
  }
}

// API bilan bir xil tekshiruv: base64 dan ochilganda aynan 32 bayt.
const apiEnv = join(root, 'apps', 'api', '.env');
const text = readFileSync(apiEnv, 'utf8');
const line = /^APP_ENCRYPTION_KEY=[ \t]*["']?([^"'\r\n]*)["']?[ \t]*$/m.exec(text);
if (line && Buffer.from(line[1], 'base64').length === 32) {
  console.log('✓ APP_ENCRYPTION_KEY yaroqli — o‘zgartirilmadi');
} else {
  const entry = `APP_ENCRYPTION_KEY="${randomBytes(32).toString('base64')}"`;
  const updated = line ? text.replace(line[0], entry) : `${text.trimEnd()}\n${entry}\n`;
  writeFileSync(apiEnv, updated);
  console.log('+ APP_ENCRYPTION_KEY yaratildi va apps/api/.env ga yozildi');
}

if (!process.argv.includes('--no-hint')) {
  console.log(
    '\nTayyor. Keyingi qadamlar: pnpm --filter @ijod/shared build → pnpm db:deploy → pnpm db:seed → pnpm dev',
  );
}
