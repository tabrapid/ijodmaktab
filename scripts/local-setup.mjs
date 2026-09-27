#!/usr/bin/env node
/**
 * Mahalliy muhitni bitta buyruq bilan tayyorlaydi (macOS, Linux, Windows):
 *  1) .env fayllari va shifrlash kaliti (scripts/setup-env.mjs);
 *  2) Docker’da PostgreSQL. 5432-portda kompyuterdagi boshqa PostgreSQL (Homebrew, Postgres.app)
 *     javob bersa, Docker bazasi bo‘sh portga ko‘chiriladi (loyiha ildizidagi .env → POSTGRES_PORT)
 *     va apps/api/.env dagi manzillar moslanadi;
 *  3) umumiy paket, migratsiyalar va demo ma’lumotlar.
 *
 * Qayta ishga tushirish xavfsiz: tayyor qadamlar o‘zgartirilmaydi, demo ma’lumotlar qayta yozilmaydi.
 * Ishga tushirish: pnpm local:setup   (so‘ng: pnpm dev)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootEnv = join(root, '.env');
const apiEnv = join(root, 'apps', 'api', '.env');
const isWindows = process.platform === 'win32';
/** docker-compose.yml dagi foydalanuvchi, parol va baza. */
const DB = { user: 'ijod', password: 'ijod', database: 'ijod' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    shell: isWindows,
  });
  if (result.error?.code === 'ENOENT') return { status: 127, stdout: '', stderr: `${command} topilmadi` };
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function step(command, args) {
  if (run(command, args).status !== 0) fail(`“${command} ${args.join(' ')}” bajarilmadi (yuqoridagi xabarga qarang).`);
}

// ---------------------------------------------------------------- Port va .env

function readPort() {
  if (!existsSync(rootEnv)) return 5432;
  const match = /^POSTGRES_PORT=[ \t]*["']?(\d+)["']?[ \t]*$/m.exec(readFileSync(rootEnv, 'utf8'));
  return match ? Number(match[1]) : 5432;
}

function writePort(port) {
  const line = `POSTGRES_PORT=${port}`;
  if (!existsSync(rootEnv)) {
    writeFileSync(rootEnv, `${line}\n`);
    return;
  }
  const text = readFileSync(rootEnv, 'utf8');
  const updated = /^POSTGRES_PORT=.*$/m.test(text)
    ? text.replace(/^POSTGRES_PORT=.*$/m, line)
    : `${text.trimEnd()}\n${line}\n`;
  writeFileSync(rootEnv, updated);
}

/** apps/api/.env dagi standart (Docker) manzillarni tanlangan portga moslaydi; boshqa sozlamalarga tegmaydi. */
function syncApiEnv(port) {
  const text = readFileSync(apiEnv, 'utf8');
  const pattern = /^((?:TEST_)?DATABASE_URL=["']?postgresql:\/\/ijod:ijod@localhost:)(\d+)(\/)/gm;
  if (!text.match(pattern)) {
    console.log('! apps/api/.env dagi DATABASE_URL standart emas — o‘zgartirilmadi.');
    return;
  }
  const updated = text.replace(pattern, (_match, head, _old, tail) => `${head}${port}${tail}`);
  if (updated !== text) {
    writeFileSync(apiEnv, updated);
    console.log(`✓ apps/api/.env: baza manzillari localhost:${port} ga moslandi`);
  } else {
    console.log(`✓ apps/api/.env: baza manzillari allaqachon localhost:${port}`);
  }
}

function isListening(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(700, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function findFreePort(from) {
  for (let port = from; port < from + 20; port += 1) {
    if (!(await isListening('127.0.0.1', port)) && !(await isListening('::1', port))) return port;
  }
  return fail(`${from}–${from + 19} oralig‘ida bo‘sh port topilmadi.`);
}

// ---------------------------------------------------------------- Docker va PostgreSQL

function checkDocker() {
  const info = run('docker', ['info'], { capture: true });
  if (info.status === 127) {
    fail(
      'Docker topilmadi. Docker Desktop’ni o‘rnating: https://www.docker.com/products/docker-desktop/ ' +
        '(yoki README dagi “Dockersiz” yo‘lidan foydalaning).',
    );
  }
  if (info.status !== 0)
    fail('Docker ishlamayapti: Docker Desktop’ni oching, to‘liq ishga tushgach buyruqni qayta bajaring.');
}

function composeUp() {
  const result = run('docker', ['compose', 'up', '-d'], { capture: true });
  process.stdout.write(result.stdout);
  process.stdout.write(result.stderr);
  if (result.status === 0) return 'ok';
  if (/port is already allocated|address already in use|ports are not available/i.test(result.stderr))
    return 'port-busy';
  return fail('“docker compose up -d” bajarilmadi (yuqoridagi xabarga qarang).');
}

function moveTo(port) {
  writePort(port);
  console.log(`→ Docker bazasi ${port}-portga ko‘chirildi (loyiha ildizidagi .env: POSTGRES_PORT=${port})`);
  if (composeUp() !== 'ok') fail(`${port}-portni ham band qilib bo‘lmadi.`);
  return port;
}

/**
 * localhost:port dagi serverga loyiha foydalanuvchisi bilan ulanib ko‘radi:
 * ok — bizning baza; foreign — boshqa server javob berdi (foydalanuvchi/parol/baza yo‘q);
 * unreachable — belgilangan vaqtda javob bo‘lmadi (konteyner hali ishga tushmoqda bo‘lsa kutiladi).
 */
async function probe(port, timeoutMs = 90_000) {
  const require = createRequire(join(root, 'apps', 'api', 'package.json'));
  const pg = require('pg');
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const client = new pg.Client({ host: 'localhost', port, ...DB, connectionTimeoutMillis: 3000 });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return { kind: 'ok' };
    } catch (error) {
      await client.end().catch(() => {});
      if (['28000', '28P01', '3D000'].includes(error.code)) return { kind: 'foreign', detail: error.message };
      last = error.message;
      await sleep(1000);
    }
  }
  return { kind: 'unreachable', detail: last };
}

// ---------------------------------------------------------------- Asosiy oqim

async function main() {
  if (!existsSync(join(root, 'apps', 'api', 'node_modules', 'pg')))
    fail('Avval bog‘liqliklarni o‘rnating: pnpm install');

  console.log('1/4 · .env fayllari');
  step('node', ['scripts/setup-env.mjs', '--no-hint']);

  console.log('\n2/4 · PostgreSQL (Docker)');
  checkDocker();
  let port = readPort();
  if (composeUp() === 'port-busy') port = moveTo(await findFreePort(port + 1));
  let state = await probe(port);
  if (state.kind === 'foreign') {
    console.log(`! localhost:${port} da boshqa PostgreSQL javob beryapti: ${state.detail}`);
    port = moveTo(await findFreePort(port + 1));
    state = await probe(port);
    if (state.kind === 'foreign') {
      fail(
        `Docker’dagi baza ham “${state.detail}” deyapti — uning ma’lumotlar papkasi (volume) boshqa sozlama bilan ` +
          'yaratilgan. Tozalash uchun “docker compose down -v” ni bajaring (Docker ichidagi mahalliy baza o‘chadi) ' +
          'va bu buyruqni qayta ishga tushiring.',
      );
    }
  }
  if (state.kind !== 'ok') fail(`localhost:${port} dagi bazaga ulanib bo‘lmadi: ${state.detail}`);
  console.log(`✓ PostgreSQL tayyor: localhost:${port}`);
  syncApiEnv(port);

  console.log('\n3/4 · Umumiy paket va migratsiyalar');
  step('pnpm', ['--filter', '@ijod/shared', 'build']);
  step('pnpm', ['db:deploy']);

  console.log('\n4/4 · Demo ma’lumotlar');
  step('pnpm', ['db:seed']);

  console.log('\n✓ Tayyor! Endi: pnpm dev  →  http://localhost:3000  (masalan, d.karimova / Demo2026!)');
}

await main();
