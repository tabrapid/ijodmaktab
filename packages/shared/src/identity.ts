/**
 * Shaxsni tasdiqlovchi hujjat ma’lumotlari: ism-familiyani o‘zbek lotin alifbosida bir xil ko‘rinishga
 * keltirish va JSHSHIR (PINFL) ni tekshirish. Bir xil qoida brauzerda ham, serverda ham ishlaydi.
 */

// ---------------------------------------------------------------- Ism va familiya

/** Apostrofning barcha ko‘rinishlari (klaviaturadagi ' va ` ham). */
const APOSTROPHES = /['`´ʹʻʼʽ‘’‛′]/g;

/** O‘zbek lotin alifbosidagi ism: harflar, o‘/g‘ belgisi (‘), tutuq belgisi (’), chiziqcha va bo‘shliq. */
const UZBEK_NAME = /^[A-Za-z][A-Za-z‘’]*(?:[ -][A-Za-z‘’]+)*$/;

/** Otasining ismidagi qo‘shimchalar kichik harf bilan yoziladi: “Baxtiyor o‘g‘li”, “Rustam qizi”. */
const LOWERCASE_WORDS = new Set(['o‘g‘li', 'qizi']);

function capitalize(word: string) {
  const lower = word.toLowerCase();
  if (LOWERCASE_WORDS.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Hujjatdagi ism yoki familiyani yagona ko‘rinishga keltiradi: ortiqcha bo‘shliqlar olib tashlanadi,
 * o‘/g‘ dagi belgi “‘”, tutuq belgisi “’” bo‘ladi, har bir so‘z bosh harf bilan yoziladi
 * (hujjatdagi KATTA HARFLAR ham): “ABDUGANIYEV” → “Abduganiyev”, “g'ulomova” → “G‘ulomova”,
 * “BAXTIYOR O'G'LI” → “Baxtiyor o‘g‘li”.
 */
export function normalizeUzbekName(value: string): string {
  const compact = value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-');
  // o‘ va g‘ harflaridan keyingi apostrof — “‘”, qolganlari — tutuq belgisi “’”.
  const marked = compact.replace(APOSTROPHES, (_mark, offset: number) =>
    /[oOgG]/.test(compact.charAt(offset - 1)) ? '‘' : '’',
  );
  return marked
    .split(' ')
    .map((word) => word.split('-').map(capitalize).join('-'))
    .join(' ');
}

/** Ism o‘zbek lotin alifbosida yozilganmi (normalizeUzbekName dan keyin tekshiriladi). */
export function isUzbekLatinName(value: string): boolean {
  return UZBEK_NAME.test(value);
}

export const UZBEK_NAME_MESSAGE =
  'Hujjatdagidek o‘zbek lotin alifbosida yozing (masalan: O‘ktamov, G‘ulomova). Kirill harflari va raqamlar qabul qilinmaydi.';

// ---------------------------------------------------------------- JSHSHIR (PINFL)

/**
 * JSHSHIR — 14 xonali shaxsiy identifikatsiya raqami: 1-raqam — jins va tug‘ilgan asr (1–2: 1800-yillar,
 * 3–4: 1900-yillar, 5–6: 2000-yillar; toq — erkak, juft — ayol), 2–7 — tug‘ilgan sana (KKOOYY),
 * 8–10 — hudud kodi, 11–13 — tartib raqami, 14 — nazorat raqami (7-3-1 og‘irliklar, 10 ga bo‘linish qoldig‘i).
 */
export const PINFL_LENGTH = 14;

/** Foydalanuvchi kiritgan qiymatdan faqat raqamlar (bo‘shliq va chiziqchalar olib tashlanadi). */
export function cleanPinfl(value: string): string {
  return value.replace(/[\s-]/g, '');
}

const CENTURY: Record<string, number> = { '1': 1800, '2': 1800, '3': 1900, '4': 1900, '5': 2000, '6': 2000 };

/** JSHSHIRdagi tug‘ilgan sana (YYYY-MM-DD) yoki null (sana noto‘g‘ri bo‘lsa). */
export function pinflBirthDate(pinfl: string): string | null {
  if (!/^\d{14}$/.test(pinfl)) return null;
  const century = CENTURY[pinfl.charAt(0)];
  if (century === undefined) return null;
  const day = Number(pinfl.slice(1, 3));
  const month = Number(pinfl.slice(3, 5));
  const year = century + Number(pinfl.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Nazorat raqami: birinchi 13 raqam 7, 3, 1, 7, 3, 1… og‘irliklar bilan ko‘paytirilib, yig‘indining 10 ga qoldig‘i. */
export function pinflChecksumValid(pinfl: string): boolean {
  if (!/^\d{14}$/.test(pinfl)) return false;
  const weights = [7, 3, 1];
  let sum = 0;
  for (let index = 0; index < 13; index += 1) sum += Number(pinfl.charAt(index)) * weights[index % 3]!;
  return sum % 10 === Number(pinfl.charAt(13));
}

export type PinflCheck = { ok: true } | { ok: false; message: string };

/**
 * JSHSHIRni tekshiradi: 14 raqam, asr belgisi, haqiqiy sana, nazorat raqami va (berilgan bo‘lsa)
 * kiritilgan tug‘ilgan sanaga mosligi.
 */
export function checkPinfl(pinfl: string, birthDate?: string | null): PinflCheck {
  if (!/^\d{14}$/.test(pinfl)) return { ok: false, message: 'JSHSHIR 14 ta raqamdan iborat bo‘lishi kerak' };
  const encoded = pinflBirthDate(pinfl);
  if (!encoded) return { ok: false, message: 'JSHSHIR noto‘g‘ri: undagi tug‘ilgan sana haqiqiy emas' };
  if (!pinflChecksumValid(pinfl)) {
    return { ok: false, message: 'JSHSHIR noto‘g‘ri kiritilgan (nazorat raqami mos kelmadi). Qayta tekshiring.' };
  }
  if (birthDate && encoded !== birthDate) {
    return { ok: false, message: 'JSHSHIRdagi tug‘ilgan sana kiritilgan tug‘ilgan sanaga mos emas' };
  }
  return { ok: true };
}

/** Ko‘rsatish uchun yashirilgan JSHSHIR: “3**********789”. */
export function maskPinfl(pinfl: string): string {
  if (pinfl.length < 5) return '*'.repeat(pinfl.length);
  return `${pinfl.charAt(0)}${'*'.repeat(pinfl.length - 4)}${pinfl.slice(-3)}`;
}
