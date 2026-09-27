/**
 * Portfolio: O‘zbekistonga xos sertifikat va natija turlari uchun tuzilgan maydonlar (details),
 * ularni ko‘rsatish va tasdiqlashda “nima o‘zgardi”ni hisoblash.
 */
import { z } from 'zod';
import type { PortfolioItemType, StructuredPortfolioType } from './enums.js';
import { STRUCTURED_PORTFOLIO_TYPES } from './enums.js';

// ---------------------------------------------------------------- Qiymatlar ro‘yxatlari

/** Milliy sertifikat darajalari (Bilim va malakalarni baholash agentligi). */
export const NATIONAL_CERTIFICATE_GRADES = ['A+', 'A', 'B+', 'B', 'C+', 'C'] as const;
export type NationalCertificateGrade = (typeof NATIONAL_CERTIFICATE_GRADES)[number];

/** Milliy sertifikat beriladigan umumta’lim fanlari (tanlash uchun taklif; boshqa fan ham yozilishi mumkin). */
export const NATIONAL_CERTIFICATE_SUBJECTS = [
  'Matematika',
  'Ona tili va adabiyot',
  'O‘zbek tili',
  'Rus tili va adabiyot',
  'Qoraqalpoq tili va adabiyot',
  'Ingliz tili',
  'Nemis tili',
  'Fransuz tili',
  'Tarix',
  'Fizika',
  'Kimyo',
  'Biologiya',
  'Geografiya',
  'Informatika',
] as const;

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** CEFR sertifikati tillari (taklif). */
export const CERTIFICATE_LANGUAGES = [
  'Ingliz tili',
  'Nemis tili',
  'Fransuz tili',
  'Rus tili',
  'Koreys tili',
  'Yapon tili',
  'Xitoy tili',
  'Arab tili',
  'Turk tili',
  'Ispan tili',
] as const;

export const IELTS_TEST_TYPES = ['ACADEMIC', 'GENERAL'] as const;
export type IeltsTestType = (typeof IELTS_TEST_TYPES)[number];
export const IELTS_TEST_TYPE_LABELS: Record<IeltsTestType, string> = {
  ACADEMIC: 'Academic',
  GENERAL: 'General Training',
};

export const OLYMPIAD_PLACES = ['FIRST', 'SECOND', 'THIRD', 'HONORABLE', 'PARTICIPANT'] as const;
export type OlympiadPlace = (typeof OLYMPIAD_PLACES)[number];
export const OLYMPIAD_PLACE_LABELS: Record<OlympiadPlace, string> = {
  FIRST: '1-o‘rin',
  SECOND: '2-o‘rin',
  THIRD: '3-o‘rin',
  HONORABLE: 'Faxriy yorliq',
  PARTICIPANT: 'Ishtirokchi',
};

// ---------------------------------------------------------------- Sxemalar

const text = (max: number, message = 'Majburiy maydon') =>
  z.string({ error: message }).trim().min(1, message).max(max, `Ko‘pi bilan ${max} ta belgi`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Ko‘pi bilan ${max} ta belgi`)
    .optional()
    .transform((value) => (value ? value : undefined));

/** IELTS balli: 0–9, 0,5 qadam bilan. */
const ieltsBand = () =>
  z
    .number({ error: 'Ballni kiriting' })
    .min(0, 'IELTS balli 0 dan 9 gacha')
    .max(9, 'IELTS balli 0 dan 9 gacha')
    .refine((value) => Number.isInteger(value * 2), 'IELTS balli 0,5 qadam bilan (masalan, 6,5)');

const satSection = () =>
  z
    .number()
    .int('Butun son kiriting')
    .min(200, 'Bo‘lim balli 200–800')
    .max(800, 'Bo‘lim balli 200–800')
    .refine((value) => value % 10 === 0, 'SAT ballari 10 ga karrali');

export const nationalCertificateDetailsSchema = z.object({
  subject: text(100, 'Fanni kiriting'),
  grade: z.enum(NATIONAL_CERTIFICATE_GRADES, { error: 'Darajani tanlang' }),
  /** Ball (foiz) — sertifikatda ko‘rsatilgan bo‘lsa. */
  score: z.number().min(0, '0–100 oralig‘ida').max(100, '0–100 oralig‘ida').optional(),
  certificateNumber: optionalText(50),
  validUntil: z.iso.date({ error: 'Sana YYYY-MM-DD ko‘rinishida' }).optional(),
});

export const cefrDetailsSchema = z.object({
  language: text(60, 'Tilni kiriting'),
  level: z.enum(CEFR_LEVELS, { error: 'Darajani tanlang' }),
  score: z.number().min(0).max(100).optional(),
  /** Imtihon turi yoki tashkiloti (masalan, Multilevel, Aptis, Linguaskill). */
  provider: optionalText(100),
  certificateNumber: optionalText(50),
});

export const ieltsDetailsSchema = z.object({
  testType: z.enum(IELTS_TEST_TYPES).default('ACADEMIC'),
  overall: ieltsBand(),
  listening: ieltsBand().optional(),
  reading: ieltsBand().optional(),
  writing: ieltsBand().optional(),
  speaking: ieltsBand().optional(),
  trfNumber: optionalText(30),
});

export const satDetailsSchema = z
  .object({
    total: z
      .number({ error: 'Umumiy ballni kiriting' })
      .int('Butun son kiriting')
      .min(400, 'Umumiy ball 400–1600')
      .max(1600, 'Umumiy ball 400–1600')
      .refine((value) => value % 10 === 0, 'SAT ballari 10 ga karrali'),
    readingWriting: satSection().optional(),
    math: satSection().optional(),
  })
  .refine(
    (value) =>
      value.readingWriting === undefined ||
      value.math === undefined ||
      value.readingWriting + value.math === value.total,
    { path: ['total'], message: 'Umumiy ball bo‘limlar yig‘indisiga teng bo‘lishi kerak' },
  );

export const olympiadDetailsSchema = z.object({
  subject: text(100, 'Fanni kiriting'),
  place: z.enum(OLYMPIAD_PLACES).optional(),
});

export const PORTFOLIO_DETAILS_SCHEMAS = {
  NATIONAL_CERTIFICATE: nationalCertificateDetailsSchema,
  CEFR: cefrDetailsSchema,
  IELTS: ieltsDetailsSchema,
  SAT: satDetailsSchema,
  OLYMPIAD: olympiadDetailsSchema,
} satisfies Record<StructuredPortfolioType, z.ZodType>;

export type NationalCertificateDetails = z.output<typeof nationalCertificateDetailsSchema>;
export type CefrDetails = z.output<typeof cefrDetailsSchema>;
export type IeltsDetails = z.output<typeof ieltsDetailsSchema>;
export type SatDetails = z.output<typeof satDetailsSchema>;
export type OlympiadDetails = z.output<typeof olympiadDetailsSchema>;

export interface PortfolioDetailsByType {
  NATIONAL_CERTIFICATE: NationalCertificateDetails;
  CEFR: CefrDetails;
  IELTS: IeltsDetails;
  SAT: SatDetails;
  OLYMPIAD: OlympiadDetails;
}
export type PortfolioDetails = PortfolioDetailsByType[StructuredPortfolioType];

export const isStructuredPortfolioType = (type: PortfolioItemType): type is StructuredPortfolioType =>
  (STRUCTURED_PORTFOLIO_TYPES as readonly string[]).includes(type);

/**
 * Turga qarab details ni tekshiradi va normallashtiradi. Tuzilgan maydoni yo‘q turlarda details `null`.
 * Xato bo‘lsa zod xatolari (yo‘l details ichidagi maydonga nisbatan) qaytariladi.
 */
export function parsePortfolioDetails(
  type: PortfolioItemType,
  details: unknown,
): { success: true; data: PortfolioDetails | null } | { success: false; issues: z.core.$ZodIssue[] } {
  if (!isStructuredPortfolioType(type)) return { success: true, data: null };
  const result = PORTFOLIO_DETAILS_SCHEMAS[type].safeParse(details ?? {});
  return result.success
    ? { success: true, data: result.data as PortfolioDetails }
    : { success: false, issues: result.error.issues };
}

// ---------------------------------------------------------------- Ko‘rsatish

const band = (value: number | undefined) => (value === undefined ? null : String(value));

/** Qisqa natija matni: “IELTS 7.5 (L 8 · R 7.5 · W 6.5 · S 7)”, “Matematika — A+ (95 ball)” va h.k. */
export function portfolioDetailsSummary(type: PortfolioItemType, details: unknown): string | null {
  const parsed = parsePortfolioDetails(type, details);
  if (!parsed.success || !parsed.data) return null;
  switch (type) {
    case 'NATIONAL_CERTIFICATE': {
      const value = parsed.data as NationalCertificateDetails;
      return `${value.subject} — ${value.grade}${value.score !== undefined ? ` (${value.score} ball)` : ''}`;
    }
    case 'CEFR': {
      const value = parsed.data as CefrDetails;
      return `${value.language}: ${value.level}${value.provider ? ` · ${value.provider}` : ''}`;
    }
    case 'IELTS': {
      const value = parsed.data as IeltsDetails;
      const parts = [
        ['L', band(value.listening)],
        ['R', band(value.reading)],
        ['W', band(value.writing)],
        ['S', band(value.speaking)],
      ].filter(([, score]) => score !== null);
      const sections = parts.length ? ` (${parts.map(([label, score]) => `${label} ${score}`).join(' · ')})` : '';
      return `IELTS ${value.overall}${sections}`;
    }
    case 'SAT': {
      const value = parsed.data as SatDetails;
      const sections =
        value.readingWriting !== undefined && value.math !== undefined
          ? ` (RW ${value.readingWriting} · M ${value.math})`
          : '';
      return `SAT ${value.total}${sections}`;
    }
    case 'OLYMPIAD': {
      const value = parsed.data as OlympiadDetails;
      return `${value.subject}${value.place ? ` — ${OLYMPIAD_PLACE_LABELS[value.place]}` : ''}`;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- O‘zgarishlar (tasdiqlash uchun)

/** Tasdiqlovchi ko‘radigan maydonlar va ularning nomlari. */
export const PORTFOLIO_TRACKED_FIELDS = [
  'type',
  'title',
  'subjectId',
  'direction',
  'description',
  'organization',
  'date',
  'level',
  'result',
  'details',
  'evidenceFileId',
  'evidenceUrl',
  'visibility',
] as const;
export type PortfolioTrackedField = (typeof PORTFOLIO_TRACKED_FIELDS)[number];

export const PORTFOLIO_FIELD_LABELS: Record<PortfolioTrackedField, string> = {
  type: 'Turi',
  title: 'Nomi',
  subjectId: 'Fan',
  direction: 'Yo‘nalish',
  description: 'Tavsif',
  organization: 'Tashkilot',
  date: 'Sana',
  level: 'Bosqich',
  result: 'Natija / o‘rin',
  details: 'Sertifikat ma’lumotlari',
  evidenceFileId: 'Dalil fayli',
  evidenceUrl: 'Dalil havolasi',
  visibility: 'Ko‘rinish',
};

export interface PortfolioFieldChange {
  field: PortfolioTrackedField;
  label: string;
  before: unknown;
  after: unknown;
}

/** Sana, bo‘sh satr va obyekt kalitlari tartibidan qat’i nazar solishtirish uchun. */
function normalize(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => [key, normalize(inner)] as const)
      .filter(([, inner]) => inner !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    return entries.length ? Object.fromEntries(entries) : null;
  }
  return value;
}

/**
 * Oxirgi tasdiqlangan holat (snapshot) bilan joriy yozuvni solishtiradi. `before` bo‘lmasa (hech qachon
 * tasdiqlanmagan yozuv) bo‘sh ro‘yxat qaytadi — bunday yozuv “yangi” deb ko‘rsatiladi.
 */
export function portfolioChanges(
  before: Partial<Record<PortfolioTrackedField, unknown>> | null | undefined,
  after: Partial<Record<PortfolioTrackedField, unknown>>,
): PortfolioFieldChange[] {
  if (!before) return [];
  const changes: PortfolioFieldChange[] = [];
  for (const field of PORTFOLIO_TRACKED_FIELDS) {
    const previous = normalize(before[field]);
    const current = normalize(after[field]);
    if (JSON.stringify(previous) !== JSON.stringify(current)) {
      changes.push({ field, label: PORTFOLIO_FIELD_LABELS[field], before: previous, after: current });
    }
  }
  return changes;
}
