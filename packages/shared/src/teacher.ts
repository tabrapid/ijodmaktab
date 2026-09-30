/**
 * O‘qituvchi ma’lumotnomasi: xalqaro sertifikat turlari va o‘quvchi sertifikatlariga ustozlik
 * (qaysi sertifikat qaysi fanga tegishli ekani).
 */
import type { MentorshipKind, PortfolioItemType } from './enums.js';
import { TEACHER_CATEGORY_VALID_YEARS } from './enums.js';
import { normalizeForSearch } from './text.js';

/**
 * Pedagoglar uchun keng tarqalgan xalqaro sertifikatlar (ustama belgilashda qo‘llaniladiganlar ham):
 * til bilish, pedagogik malaka va boshqalar. Ro‘yxatda bo‘lmasa — “Boshqa”.
 */
export const INTERNATIONAL_CERTIFICATE_TYPES = [
  'IELTS',
  'TOEFL_IBT',
  'TOEFL_ITP',
  'CEFR',
  'CAMBRIDGE',
  'TKT',
  'CELTA',
  'DELTA',
  'TESOL_TEFL',
  'GOETHE',
  'TESTDAF',
  'DELF_DALF',
  'TORFL',
  'TOPIK',
  'JLPT',
  'HSK',
  'TURKISH',
  'SAT',
  'OTHER',
] as const;
export type InternationalCertificateType = (typeof INTERNATIONAL_CERTIFICATE_TYPES)[number];

export const INTERNATIONAL_CERTIFICATE_LABELS: Record<InternationalCertificateType, string> = {
  IELTS: 'IELTS',
  TOEFL_IBT: 'TOEFL iBT',
  TOEFL_ITP: 'TOEFL ITP',
  CEFR: 'CEFR (Multilevel va boshqalar)',
  CAMBRIDGE: 'Cambridge English (FCE, CAE, CPE)',
  TKT: 'TKT (Teaching Knowledge Test)',
  CELTA: 'CELTA',
  DELTA: 'DELTA',
  TESOL_TEFL: 'TESOL / TEFL / TESL',
  GOETHE: 'Goethe-Zertifikat (nemis tili)',
  TESTDAF: 'TestDaF (nemis tili)',
  DELF_DALF: 'DELF / DALF (fransuz tili)',
  TORFL: 'TORFL / ТРКИ (rus tili)',
  TOPIK: 'TOPIK (koreys tili)',
  JLPT: 'JLPT (yapon tili)',
  HSK: 'HSK (xitoy tili)',
  TURKISH: 'Turk tili sertifikati (Yunus Emre va b.)',
  SAT: 'SAT',
  OTHER: 'Boshqa xalqaro sertifikat',
};

/** Fan nomlarini solishtirish: kichik harf, yagona apostrof, “… va adabiyot” qo‘shimchasi e’tiborsiz. */
function subjectKey(name: string) {
  return normalizeForSearch(name).replace(/ va adabiyoti?$/, '');
}

/** Ikki fan nomi bitta fanmi: “Ona tili va adabiyot” = “Ona tili”, “Ingliz tili” = “ingliz tili”. */
export function subjectNamesMatch(a: string, b: string): boolean {
  return subjectKey(a) === subjectKey(b);
}

/** Ustozlik qayd etiladigan o‘quvchi sertifikati turi: milliy yoki xalqaro (boshqalari — yo‘q). */
export function mentorshipKindOf(type: PortfolioItemType): MentorshipKind | null {
  if (type === 'NATIONAL_CERTIFICATE') return 'NATIONAL';
  if (type === 'IELTS' || type === 'SAT' || type === 'CEFR') return 'INTERNATIONAL';
  return null;
}

/**
 * O‘quvchi sertifikati qaysi fan(lar)ga tegishli: milliy sertifikat — o‘z fani, IELTS — ingliz tili,
 * CEFR — sertifikat tili, SAT — matematika va ingliz tili.
 */
export function certificateSubjectNames(type: PortfolioItemType, details: unknown): string[] {
  const value = (details && typeof details === 'object' ? details : {}) as Record<string, unknown>;
  switch (type) {
    case 'NATIONAL_CERTIFICATE':
      return typeof value.subject === 'string' && value.subject.trim() ? [value.subject] : [];
    case 'IELTS':
      return ['Ingliz tili'];
    case 'CEFR':
      return typeof value.language === 'string' && value.language.trim() ? [value.language] : [];
    case 'SAT':
      return ['Matematika', 'Ingliz tili'];
    default:
      return [];
  }
}

/** O‘qituvchi mutaxassisligi (fan nomi) bo‘yicha shu sertifikatga ustozlik qila oladimi. */
export function certificateMatchesSpecialty(type: PortfolioItemType, details: unknown, specialty: string): boolean {
  if (!mentorshipKindOf(type)) return false;
  return certificateSubjectNames(type, details).some((name) => subjectNamesMatch(name, specialty));
}

// ---------------------------------------------------------------- Malaka toifasi muddati

/** Toifa muddati tugashidan shuncha oy oldin ogohlantiriladi. */
export const TEACHER_CATEGORY_WARNING_MONTHS = 6;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad2 = (value: number) => String(value).padStart(2, '0');

/**
 * “YYYY-MM-DD” sanaga oy qo‘shadi (manfiy — ayiradi). Oyda bunday kun bo‘lmasa, oyning oxirgi kuni
 * olinadi: 29-fevral + 1 yil → 28-fevral.
 */
export function addMonthsToIsoDate(value: string, months: number): string {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error(`Sana YYYY-MM-DD ko‘rinishida emas: ${value}`);
  const total = Number(match[1]) * 12 + (Number(match[2]) - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad2(month)}-${pad2(Math.min(Number(match[3]), lastDay))}`;
}

/** Toifa amal qilish muddati: berilgan sanadan 5 yil (“YYYY-MM-DD”). */
export function teacherCategoryValidUntil(awardedOn: string): string {
  return addMonthsToIsoDate(awardedOn, TEACHER_CATEGORY_VALID_YEARS * 12);
}

export interface TeacherCategoryValidity {
  /** Oxirgi amal qiladigan kun. */
  validUntil: string;
  /** Muddati o‘tgan (bugun `validUntil` dan keyin). */
  expired: boolean;
  /** Muddati tugashiga 6 oydan kam qolgan (hali o‘tmagan). */
  expiresSoon: boolean;
}

/** Toifa holati berilgan kunga (“YYYY-MM-DD”, maktab vaqti bo‘yicha) nisbatan. */
export function teacherCategoryValidity(awardedOn: string, today: string): TeacherCategoryValidity {
  const validUntil = teacherCategoryValidUntil(awardedOn);
  const expired = today > validUntil;
  const expiresSoon = !expired && today >= addMonthsToIsoDate(validUntil, -TEACHER_CATEGORY_WARNING_MONTHS);
  return { validUntil, expired, expiresSoon };
}
