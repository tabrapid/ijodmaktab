import { randomInt } from 'node:crypto';
import argon2 from 'argon2';

/** OWASP tavsiyasi: Argon2id, m=19 MiB, t=2, p=1. Parollar qayta o‘qiladigan shaklda saqlanmaydi. */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => argon2.hash(password, OPTIONS);

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** Mavjud bo‘lmagan login uchun ham shuncha vaqt sarflanadi (loginlar ro‘yxatini aniqlab bo‘lmaydi). */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword('ijod-maktabi-dummy-password');
  await verifyPassword(await dummyHash, password);
}

/** Chalkashtiriladigan belgilar (0/O, 1/l/I) ishlatilmaydi — qog‘ozdan o‘qib kiritish oson bo‘lsin. */
const LETTERS = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';

/** Vaqtinchalik parol, masalan “kvdm-4827”. Birinchi kirishda almashtirish majburiy. */
export function generateTemporaryPassword(): string {
  const pick = (alphabet: string, count: number) =>
    Array.from({ length: count }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `${pick(LETTERS, 4)}-${pick(DIGITS, 4)}`;
}
