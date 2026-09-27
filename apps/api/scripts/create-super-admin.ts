/**
 * Haqiqiy (demo bo‘lmagan) bazada birinchi super admin hisobini yaratadi.
 *
 * Ishlatish (apps/api papkasida, .env da DATABASE_URL bilan):
 *   pnpm admin:create --login tizim.admin --last Familiya --first Ism [--middle Otasining_ismi] [--school "Maktab nomi"]
 *
 * Vaqtinchalik parol faqat bir marta ekranga chiqariladi va hech qayerda saqlanmaydi. Birinchi kirishda
 * (/system/login) parol almashtiriladi va ikki bosqichli tasdiqlash (TOTP) majburiy sozlanadi.
 * Amal audit jurnaliga “system.super_admin_created” sifatida yoziladi.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { loginValue, personNameShape, userSearchText } from '@ijod/shared';
import { z } from 'zod';
import { hashPassword } from '../src/auth/passwords.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const { values } = parseArgs({
  options: {
    login: { type: 'string' },
    last: { type: 'string' },
    first: { type: 'string' },
    middle: { type: 'string' },
    school: { type: 'string' },
  },
});

const input = z
  .object({ login: loginValue(), ...personNameShape, school: z.string().trim().min(2).max(200).optional() })
  .safeParse({
    login: values.login,
    lastName: values.last,
    firstName: values.first,
    middleName: values.middle,
    school: values.school,
  });

if (!input.success) {
  console.error('Noto‘g‘ri parametrlar:');
  const flags: Record<string, string> = { lastName: 'last', firstName: 'first', middleName: 'middle' };
  for (const issue of input.error.issues) {
    const field = String(issue.path[0] ?? '');
    console.error(`  --${flags[field] ?? field}: ${issue.message}`);
  }
  console.error('\nMisol: pnpm admin:create --login tizim.admin --last Karimov --first Anvar');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });

async function main() {
  const data = input.data!;
  if (await prisma.user.findUnique({ where: { login: data.login } })) {
    throw new Error(`“${data.login}” logini band.`);
  }
  if (!(await prisma.school.findUnique({ where: { id: 1 } }))) {
    await prisma.school.create({ data: { id: 1, name: data.school ?? 'Ijod maktabi' } });
  }
  // Kuchli vaqtinchalik parol: 18 ta belgi (base64url).
  const temporaryPassword = randomBytes(14).toString('base64url');
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        login: data.login,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        lastName: data.lastName,
        firstName: data.firstName,
        middleName: data.middleName ?? null,
        searchText: userSearchText({ ...data, login: data.login }),
        roles: { create: [{ role: 'SUPER_ADMIN' }] },
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: null,
        actorRoles: [],
        action: 'system.super_admin_created',
        entityType: 'User',
        entityId: created.id,
        data: { login: data.login, via: 'cli' },
      },
    });
    return created;
  });

  console.log('\nSuper admin yaratildi.');
  console.log(`  Login:               ${user.login}`);
  console.log(`  Vaqtinchalik parol:  ${temporaryPassword}`);
  console.log('  Kirish manzili:      /system/login');
  console.log('\nParol faqat hozir ko‘rsatiladi. Birinchi kirishda uni almashtiring va TOTP ilovasini ulang.\n');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
