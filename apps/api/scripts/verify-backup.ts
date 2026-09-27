/**
 * Zaxiradan tiklangan (yoki ishlayotgan) tizimda bog‘lanishlarni tekshiradi — reja, 19-bo‘lim, 12-ssenariy:
 * hisoblar, javoblar va fayllar bog‘lanishi saqlanganmi.
 *
 * Ishlatish:
 *   DATABASE_URL=... STORAGE_DIR=... pnpm backup:verify            — tekshiruv natijasi
 *   DATABASE_URL=... STORAGE_DIR=... pnpm backup:verify --json     — solishtirish uchun “barmoq izi”
 *
 * Zaxiradan oldin asl tizimda va tiklangandan keyin yangi tizimda `--json` natijalari bir xil bo‘lishi kerak
 * (docs/zaxira.md). Xato topilsa chiqish kodi 1.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const { values } = parseArgs({ options: { json: { type: 'boolean', default: false } } });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
const storageDir = resolve(process.env.STORAGE_DIR ?? './storage');

const sha256File = (path: string) =>
  new Promise<string>((done, fail) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => done(hash.digest('hex')))
      .on('error', fail);
  });

/** Tartiblangan qatorlardan barqaror xesh (id’lar, bog‘lanishlar va ballar). */
async function fingerprint(sql: string) {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);
  const hash = createHash('sha256');
  for (const row of rows)
    hash.update(`${JSON.stringify(row, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))}\n`);
  return { rows: rows.length, sha256: hash.digest('hex') };
}

async function main() {
  const problems: string[] = [];

  const sections = {
    users: await fingerprint(
      `SELECT u.id, u."internalId", u.login, u.status, u."passwordHash",
              (SELECT string_agg(r.role::text, ',' ORDER BY r.role) FROM "RoleAssignment" r WHERE r."userId" = u.id) AS roles
       FROM "User" u ORDER BY u.id`,
    ),
    enrollments: await fingerprint(
      `SELECT id, "studentId", "classId", "startsOn", "endsOn" FROM "Enrollment" ORDER BY id`,
    ),
    sessions: await fingerprint(
      `SELECT id, "testVersionId", "gradingVersion", "gradingOverrides" FROM "AssessmentSession" ORDER BY id`,
    ),
    attempts: await fingerprint(
      `SELECT id, "sessionId", "assignmentId", "studentId", "attemptNo", status, score, "maxScore", "gradingVersion" FROM "Attempt" ORDER BY id`,
    ),
    answers: await fingerprint(
      `SELECT "attemptId", "testQuestionId", "optionId", revision FROM "Answer" ORDER BY "attemptId", "testQuestionId"`,
    ),
    gradeRevisions: await fingerprint(
      `SELECT id, "sessionId", version, "affectedCount" FROM "GradeRevision" ORDER BY id`,
    ),
    portfolio: await fingerprint(`SELECT id, "ownerId", status, "evidenceFileId" FROM "PortfolioItem" ORDER BY id`),
    files: await fingerprint(
      `SELECT id, "ownerId", "storageKey", sha256, status FROM "FileAsset" WHERE "deletedAt" IS NULL ORDER BY id`,
    ),
    audit: await fingerprint(`SELECT id, action, "entityId" FROM "AuditEvent" ORDER BY id`),
  };

  // 1) Urinish ↔ tayinlov ↔ o‘quvchi ↔ sessiya izchilligi.
  const [attemptMismatch] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*) FROM "Attempt" a JOIN "SessionAssignment" sa ON sa.id = a."assignmentId"
     WHERE sa."studentId" <> a."studentId" OR sa."sessionId" <> a."sessionId"`,
  );
  if (Number(attemptMismatch?.count ?? 0) > 0)
    problems.push(`${attemptMismatch!.count} ta urinish tayinlovga mos emas`);

  // 2) Javob o‘sha sessiya testidagi savolga tegishli.
  const [answerMismatch] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*) FROM "Answer" an
     JOIN "Attempt" a ON a.id = an."attemptId"
     JOIN "AssessmentSession" s ON s.id = a."sessionId"
     JOIN "TestQuestion" tq ON tq.id = an."testQuestionId"
     WHERE tq."testVersionId" <> s."testVersionId"`,
  );
  if (Number(answerMismatch?.count ?? 0) > 0)
    problems.push(`${answerMismatch!.count} ta javob boshqa test savoliga bog‘langan`);

  // 3) Portfolio dalili egasining o‘z fayli.
  const [evidenceMismatch] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*) FROM "PortfolioItem" p JOIN "FileAsset" f ON f.id = p."evidenceFileId" WHERE f."ownerId" <> p."ownerId"`,
  );
  if (Number(evidenceMismatch?.count ?? 0) > 0)
    problems.push(`${evidenceMismatch!.count} ta portfolio dalili boshqa foydalanuvchi faylida`);

  // 4) Har bir fayl yozuvi uchun diskdagi fayl mavjud va nazorat yig‘indisi mos.
  const assets = await prisma.fileAsset.findMany({
    where: { deletedAt: null },
    select: { id: true, storageKey: true, sha256: true, status: true },
  });
  let missing = 0;
  let corrupted = 0;
  for (const asset of assets) {
    const path = join(storageDir, asset.status === 'CLEAN' ? 'files' : 'quarantine', asset.storageKey);
    if (!existsSync(path)) {
      missing += 1;
      continue;
    }
    if ((await sha256File(path)) !== asset.sha256) corrupted += 1;
  }
  if (missing) problems.push(`${missing} ta fayl diskda topilmadi (${storageDir})`);
  if (corrupted) problems.push(`${corrupted} ta faylning nazorat yig‘indisi mos emas`);

  // 5) Audit jurnalini himoyalovchi trigger tiklangan.
  const triggers = await prisma.$queryRawUnsafe<{ tgname: string }[]>(
    `SELECT tgname FROM pg_trigger WHERE tgrelid = '"AuditEvent"'::regclass AND NOT tgisinternal`,
  );
  if (!triggers.some((trigger) => trigger.tgname === 'AuditEvent_no_update'))
    problems.push('Audit jurnali triggeri yo‘q');

  if (values.json) {
    console.log(JSON.stringify({ sections, files: { checked: assets.length, missing, corrupted }, problems }, null, 2));
  } else {
    console.log('Bo‘limlar (qatorlar soni):');
    for (const [name, section] of Object.entries(sections))
      console.log(`  ${name.padEnd(15)} ${String(section.rows).padStart(7)}  ${section.sha256.slice(0, 16)}`);
    console.log(`Fayllar tekshirildi: ${assets.length}`);
    console.log(
      problems.length
        ? `\nMUAMMOLAR:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`
        : '\nHammasi joyida: bog‘lanishlar va fayllar butun.',
    );
  }
  if (problems.length) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
