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
