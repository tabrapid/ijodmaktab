/**
 * Matn bilan ishlash: lotin apostrofining turli ko‘rinishlari qidiruvda moslashtiriladi,
 * asl yozuv esa o‘zgarmay saqlanadi (reja, 11-bo‘lim).
 */

/** ' ` ´ ʹ ʻ ʼ ʽ ‘ ’ ‛ ′ — barchasi qidiruvda bitta belgi sifatida qaraladi. */
const APOSTROPHE_VARIANTS = /['`´ʹʻʼʽ‘’‛′]/g;

export function normalizeApostrophes(value: string): string {
  return value.replace(APOSTROPHE_VARIANTS, "'");
}

/** Qidiruv uchun normallashtirilgan ko‘rinish: kichik harflar, yagona apostrof, ortiqcha bo‘shliqsiz. */
export function normalizeForSearch(value: string): string {
  return normalizeApostrophes(value.normalize('NFC')).toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface PersonName {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}

/** F.I.Sh.: familiya, ism, otasining ismi. */
export function fullName(person: PersonName): string {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');
}

/** Qisqa ko‘rinish: “Karimova Z.” */
export function shortName(person: PersonName): string {
  return `${person.lastName} ${person.firstName.charAt(0)}.`;
}

/** Foydalanuvchining qidiruv matni: ism-familiya va ichki ID. */
export function userSearchText(person: PersonName & { login?: string | null }): string {
  return normalizeForSearch(
    [person.lastName, person.firstName, person.middleName, person.login].filter(Boolean).join(' '),
  );
}

/** Ichki ID ko‘rinishi: 123 → “000123”. */
export function formatInternalId(internalId: number): string {
  return String(internalId).padStart(6, '0');
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h',
};

/** Kirill yozuvidagi matnni lotin yozuviga o‘giradi (login yaratish uchun yetarli aniqlikda). */
export function transliterate(value: string): string {
  return [...value]
    .map((char) => {
      const lower = char.toLowerCase();
      const mapped = CYRILLIC_TO_LATIN[lower];
      if (mapped === undefined) return char;
      return char === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    })
    .join('');
}

/** Ism-familiyadan login: “Zebo”, “O‘rinboyeva” → “zebo.orinboyeva”. */
export function loginFromName(firstName: string, lastName: string): string {
  const clean = (value: string) =>
    normalizeApostrophes(transliterate(value))
      .toLowerCase()
      .replace(/'/g, '')
      .replace(/[^a-z0-9]/g, '');
  const login = [clean(firstName), clean(lastName)].filter(Boolean).join('.');
  return login.length >= 3 ? login.slice(0, 40) : `user.${login}`.slice(0, 40);
}
