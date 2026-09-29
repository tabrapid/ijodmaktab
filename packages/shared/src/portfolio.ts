/**
 * Portfolio: O‘zbekistonga xos sertifikat va natija turlari uchun tuzilgan maydonlar (details),
 * ularni ko‘rsatish va tasdiqlashda “nima o‘zgardi”ni hisoblash.
 */
import { z } from 'zod';
import type { PortfolioItemType, StructuredPortfolioType } from './enums.js';
import {
  CERTIFICATE_PORTFOLIO_TYPES,
  CREATIVE_PORTFOLIO_TYPES,
  PORTFOLIO_ITEM_TYPES,
  STRUCTURED_PORTFOLIO_TYPES,
} from './enums.js';

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

/** Details bo‘shmi: yo‘q yoki barcha qiymatlari bo‘sh (forma bo‘sh maydonlarni ham yuboradi). */
export function portfolioDetailsEmpty(details: unknown): boolean {
  if (details === undefined || details === null) return true;
  if (typeof details !== 'object' || Array.isArray(details)) return false;
  return Object.values(details as Record<string, unknown>).every(
    (value) => value === undefined || value === null || (typeof value === 'string' && !value.trim()),
  );
}

/**
 * Avvalgi shaklda kiritilgan olimpiada: fan va o‘rin alohida saqlanmagan, natija erkin matn. Bunday yozuvni
 * tahrirlashda details majburiy emas va natija matni saqlanadi (server buni faqat details’siz saqlangan
 * olimpiada yozuvi uchun qabul qiladi).
 */
export const isLegacyPortfolioDetails = (type: PortfolioItemType, details: unknown) =>
  type === 'OLYMPIAD' && portfolioDetailsEmpty(details);

// ---------------------------------------------------------------- Ko‘rsatish

/** IELTS balli rasmiy hisobotdagidek bir kasr xonasi bilan: 7 → “7.0”, 6.5 → “6.5”. */
export const formatIeltsBand = (value: number) => value.toFixed(1);

const band = (value: number | undefined) => (value === undefined ? null : formatIeltsBand(value));

/** Qisqa natija matni: “IELTS 7.5 (L 8.0 · R 7.5 · W 6.5 · S 7.0)”, “Matematika — A+ (95 ball)” va h.k. */
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
      return `IELTS ${formatIeltsBand(value.overall)}${sections}`;
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

// ---------------------------------------------------------------- Muhim maydonlar va saqlanadigan ko‘rinish

/**
 * O‘zgarsa tasdiqlangan yozuv qoralamaga qaytadigan (qayta tasdiqlash kerak bo‘lgan) maydonlar.
 * Tavsif, yo‘nalish va ko‘rinish doirasi tasdiqqa ta’sir qilmaydi. Server va veb-ilova bir xil ro‘yxatdan foydalanadi.
 */
export const PORTFOLIO_KEY_FIELDS = [
  'type',
  'title',
  'subjectId',
  'organization',
  'date',
  'level',
  'result',
  'details',
  'evidenceFileId',
  'evidenceUrl',
] as const satisfies readonly PortfolioTrackedField[];
export type PortfolioKeyField = (typeof PORTFOLIO_KEY_FIELDS)[number];

type TrackedRecord = Partial<Record<PortfolioTrackedField, unknown>>;

const pickFields = (record: TrackedRecord, fields: readonly PortfolioTrackedField[]): TrackedRecord =>
  Object.fromEntries(fields.map((field) => [field, record[field]]));

/**
 * Tuzilgan turda natija details dan yasaladi, shuning uchun solishtirishda saqlangan matn emas, uning
 * joriy ko‘rinishi olinadi: natija formati o‘zgarsa (masalan, “IELTS 7” → “IELTS 7.0”) yolg‘on o‘zgarish
 * chiqmaydi. Details’siz (avvalgi shakldagi) yozuvda saqlangan natija matni solishtiriladi.
 */
function withDerivedResult(record: TrackedRecord): TrackedRecord {
  const type = record.type;
  if (!Object.hasOwn(record, 'result') || typeof type !== 'string') return record;
  if (!isStructuredPortfolioType(type as PortfolioItemType)) return record;
  const summary = portfolioDetailsSummary(type as PortfolioItemType, record.details);
  return summary === null ? record : { ...record, result: summary };
}

/** Faqat muhim maydonlar bo‘yicha o‘zgarishlar: bo‘sh bo‘lmasa, tasdiqlangan yozuv qoralamaga qaytadi. */
export function portfolioKeyChanges(before: TrackedRecord, after: TrackedRecord): PortfolioFieldChange[] {
  return portfolioChanges(
    pickFields(withDerivedResult(before), PORTFOLIO_KEY_FIELDS),
    pickFields(withDerivedResult(after), PORTFOLIO_KEY_FIELDS),
  );
}

/**
 * Oxirgi tasdiqlangan holat (snapshot) bilan joriy yozuv farqi — faqat snapshotda saqlangan maydonlar
 * bo‘yicha, shuning uchun eski (to‘liq bo‘lmagan) snapshotlar yolg‘on “o‘zgargan” qatorlar bermaydi.
 */
export function portfolioChangesSince(
  snapshot: Record<string, unknown> | null | undefined,
  current: TrackedRecord,
): PortfolioFieldChange[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const fields = PORTFOLIO_TRACKED_FIELDS.filter((field) => Object.hasOwn(snapshot, field));
  return portfolioChanges(
    pickFields(withDerivedResult(snapshot as TrackedRecord), fields),
    pickFields(withDerivedResult(current), fields),
  );
}

/**
 * Serverda saqlanadigan ko‘rinish: tuzilgan turlarda details tekshirilib normallashtiriladi va natija
 * (result) undan avtomatik yasaladi; boshqa turlarda details saqlanmaydi. `valid: false` — details noto‘g‘ri.
 */
export function portfolioStoredFields(
  type: PortfolioItemType,
  details: unknown,
  result: string | null | undefined,
): { details: PortfolioDetails | null; result: string | null; valid: boolean } {
  if (!isStructuredPortfolioType(type)) return { details: null, result: result?.trim() || null, valid: true };
  const parsed = parsePortfolioDetails(type, details);
  if (!parsed.success || !parsed.data) return { details: null, result: null, valid: false };
  return { details: parsed.data, result: portfolioDetailsSummary(type, parsed.data), valid: true };
}

// ---------------------------------------------------------------- Bo‘limlar (kategoriyalar)

export const PORTFOLIO_CATEGORIES = ['CERTIFICATES', 'OLYMPIADS', 'CREATIVE', 'OTHER'] as const;
export type PortfolioCategory = (typeof PORTFOLIO_CATEGORIES)[number];

export const PORTFOLIO_CATEGORY_LABELS: Record<PortfolioCategory, string> = {
  CERTIFICATES: 'Sertifikatlar',
  OLYMPIADS: 'Olimpiadalar',
  CREATIVE: 'Ijodiy ishlar',
  OTHER: 'Boshqa yutuqlar',
};

const OLYMPIAD_CATEGORY_TYPES: readonly PortfolioItemType[] = ['OLYMPIAD', 'CONTEST'];

/** Portfolio bo‘limlari: sertifikatlar, olimpiada va tanlovlar, ijodiy ishlar, qolganlari. */
export const PORTFOLIO_CATEGORY_TYPES: Record<PortfolioCategory, readonly PortfolioItemType[]> = {
  CERTIFICATES: CERTIFICATE_PORTFOLIO_TYPES,
  OLYMPIADS: OLYMPIAD_CATEGORY_TYPES,
  CREATIVE: CREATIVE_PORTFOLIO_TYPES,
  OTHER: PORTFOLIO_ITEM_TYPES.filter(
    (type) =>
      !CERTIFICATE_PORTFOLIO_TYPES.includes(type) &&
      !OLYMPIAD_CATEGORY_TYPES.includes(type) &&
      !CREATIVE_PORTFOLIO_TYPES.includes(type),
  ),
};

export const portfolioCategoryOf = (type: PortfolioItemType): PortfolioCategory =>
  PORTFOLIO_CATEGORIES.find((category) => PORTFOLIO_CATEGORY_TYPES[category].includes(type)) ?? 'OTHER';

// ---------------------------------------------------------------- Details maydonlari: nomlar va qiymatlar

export const PORTFOLIO_DETAIL_FIELD_LABELS: { [T in StructuredPortfolioType]: Record<string, string> } = {
  NATIONAL_CERTIFICATE: {
    subject: 'Fan',
    grade: 'Daraja',
    score: 'Ball',
    certificateNumber: 'Sertifikat raqami',
    validUntil: 'Amal qilish muddati',
  },
  CEFR: {
    language: 'Til',
    level: 'Daraja',
    score: 'Ball',
    provider: 'Imtihon / tashkilot',
    certificateNumber: 'Sertifikat raqami',
  },
  IELTS: {
    testType: 'Imtihon turi',
    overall: 'Umumiy ball (Overall)',
    listening: 'Listening',
    reading: 'Reading',
    writing: 'Writing',
    speaking: 'Speaking',
    trfNumber: 'TRF raqami',
  },
  SAT: {
    total: 'Umumiy ball',
    readingWriting: 'Reading and Writing',
    math: 'Math',
  },
  OLYMPIAD: {
    subject: 'Fan',
    place: 'O‘rin',
  },
};

/** IELTS ballari saqlanadigan maydonlar (boshqa turlarda bu nomlar yo‘q). */
const IELTS_BAND_FIELDS: ReadonlySet<string> = new Set(['overall', 'listening', 'reading', 'writing', 'speaking']);

/** Details qiymatining ko‘rinishi: “Academic”, “1-o‘rin”, “01.05.2027”, IELTS 7 → “7.0”. */
export function portfolioDetailValue(field: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (IELTS_BAND_FIELDS.has(field) && typeof value === 'number' && Number.isFinite(value)) {
    return formatIeltsBand(value);
  }
  if (field === 'testType' && typeof value === 'string' && value in IELTS_TEST_TYPE_LABELS) {
    return IELTS_TEST_TYPE_LABELS[value as IeltsTestType];
  }
  if (field === 'place' && typeof value === 'string' && value in OLYMPIAD_PLACE_LABELS) {
    return OLYMPIAD_PLACE_LABELS[value as OlympiadPlace];
  }
  if (field === 'validUntil' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}.${month}.${year}`;
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export interface PortfolioDetailLine {
  field: string;
  label: string;
  value: string;
}

/** Details ni nomlangan qatorlar ko‘rinishida qaytaradi (bo‘sh qiymatlar tashlab ketiladi). */
export function portfolioDetailsLines(type: PortfolioItemType, details: unknown): PortfolioDetailLine[] {
  if (!isStructuredPortfolioType(type) || !details || typeof details !== 'object') return [];
  const record = details as Record<string, unknown>;
  const labels = PORTFOLIO_DETAIL_FIELD_LABELS[type];
  const fields = [...Object.keys(labels), ...Object.keys(record).filter((key) => !(key in labels))];
  return fields
    .filter((field) => record[field] !== undefined && record[field] !== null && record[field] !== '')
    .map((field) => ({ field, label: labels[field] ?? field, value: portfolioDetailValue(field, record[field]) }));
}

export interface PortfolioDetailChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

/**
 * Ikki details obyektini maydonma-maydon solishtiradi (tasdiqlovchiga “eski → yangi” jadvali uchun).
 * Tur o‘zgargan bo‘lsa, nomlar avval yangi, keyin eski tur bo‘yicha olinadi.
 */
export function portfolioDetailChanges(
  beforeType: PortfolioItemType | null | undefined,
  before: unknown,
  afterType: PortfolioItemType | null | undefined,
  after: unknown,
): PortfolioDetailChange[] {
  const asRecord = (value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const previous = asRecord(before);
  const current = asRecord(after);
  const labelsOf = (type: PortfolioItemType | null | undefined) =>
    type && isStructuredPortfolioType(type) ? PORTFOLIO_DETAIL_FIELD_LABELS[type] : {};
  const labels = { ...labelsOf(beforeType), ...labelsOf(afterType) };
  const fields = [...new Set([...Object.keys(labels), ...Object.keys(previous), ...Object.keys(current)])];
  const changes: PortfolioDetailChange[] = [];
  for (const field of fields) {
    const was = portfolioDetailValue(field, previous[field]);
    const now = portfolioDetailValue(field, current[field]);
    if (was !== now) changes.push({ field, label: labels[field] ?? field, before: was, after: now });
  }
  return changes;
}

// ---------------------------------------------------------------- Qisqa nishonlar (katalog uchun)

/** IELTS umumiy balli: to‘rt bo‘lim o‘rtachasi eng yaqin 0,5 ga yaxlitlanadi (.25 → .5, .75 → keyingi butun). */
export function ieltsOverallFromBands(
  listening: number | undefined,
  reading: number | undefined,
  writing: number | undefined,
  speaking: number | undefined,
): number | null {
  const bands = [listening, reading, writing, speaking];
  if (bands.some((value) => value === undefined || !Number.isFinite(value))) return null;
  const average = (bands as number[]).reduce((sum, value) => sum + value, 0) / 4;
  return Math.round(average * 2) / 2;
}

/** Qisqa nishon: “IELTS 7.5”, “SAT 1450”, “CEFR B2”, “Milliy: Matematika A+”, “Olimpiada: Fizika 1-o‘rin”. */
export function portfolioHighlight(type: PortfolioItemType, details: unknown): string | null {
  const parsed = parsePortfolioDetails(type, details);
  if (!parsed.success || !parsed.data) return null;
  switch (type) {
    case 'IELTS':
      return `IELTS ${formatIeltsBand((parsed.data as IeltsDetails).overall)}`;
    case 'SAT':
      return `SAT ${(parsed.data as SatDetails).total}`;
    case 'CEFR': {
      const value = parsed.data as CefrDetails;
      return value.language === 'Ingliz tili' ? `CEFR ${value.level}` : `CEFR ${value.level} (${value.language})`;
    }
    case 'NATIONAL_CERTIFICATE': {
      const value = parsed.data as NationalCertificateDetails;
      return `Milliy: ${value.subject} ${value.grade}`;
    }
    case 'OLYMPIAD': {
      const value = parsed.data as OlympiadDetails;
      return `Olimpiada: ${value.subject}${value.place ? ` ${OLYMPIAD_PLACE_LABELS[value.place]}` : ''}`;
    }
    default:
      return null;
  }
}

const HIGHLIGHT_ORDER: readonly StructuredPortfolioType[] = [
  'IELTS',
  'SAT',
  'CEFR',
  'NATIONAL_CERTIFICATE',
  'OLYMPIAD',
];

/** Bir tur ichida eng yaxshisini tanlash uchun: guruh kaliti va ball (katta — yaxshi). */
function highlightRank(type: StructuredPortfolioType, details: PortfolioDetails): { group: string; score: number } {
  switch (type) {
    case 'IELTS':
      return { group: 'IELTS', score: (details as IeltsDetails).overall };
    case 'SAT':
      return { group: 'SAT', score: (details as SatDetails).total };
    case 'CEFR': {
      const value = details as CefrDetails;
      return { group: `CEFR:${value.language}`, score: CEFR_LEVELS.indexOf(value.level) };
    }
    case 'NATIONAL_CERTIFICATE': {
      const value = details as NationalCertificateDetails;
      return {
        group: `NC:${value.subject.toLowerCase()}`,
        score: NATIONAL_CERTIFICATE_GRADES.length - NATIONAL_CERTIFICATE_GRADES.indexOf(value.grade),
      };
    }
    case 'OLYMPIAD': {
      const value = details as OlympiadDetails;
      const place = value.place ? OLYMPIAD_PLACES.indexOf(value.place) : OLYMPIAD_PLACES.length;
      return { group: `OL:${value.subject.toLowerCase()}`, score: OLYMPIAD_PLACES.length - place };
    }
  }
}

/**
 * Tasdiqlangan tuzilgan yozuvlardan ko‘pi bilan `limit` ta qisqa nishon: IELTS → SAT → CEFR → milliy sertifikat →
 * olimpiada tartibida, har bir imtihon (fan, til) bo‘yicha eng yaxshi natija.
 */
export function pickPortfolioHighlights(
  items: readonly { type: PortfolioItemType; details: unknown }[],
  limit = 4,
): string[] {
  const best = new Map<string, { order: number; score: number; text: string }>();
  for (const item of items) {
    if (!isStructuredPortfolioType(item.type)) continue;
    const parsed = parsePortfolioDetails(item.type, item.details);
    if (!parsed.success || !parsed.data) continue;
    const text = portfolioHighlight(item.type, parsed.data);
    if (!text) continue;
    const { group, score } = highlightRank(item.type, parsed.data);
    const current = best.get(group);
    if (!current || score > current.score) {
      best.set(group, { order: HIGHLIGHT_ORDER.indexOf(item.type), score, text });
    }
  }
  return [...best.values()]
    .sort((a, b) => a.order - b.order || b.score - a.score || a.text.localeCompare(b.text))
    .map((entry) => entry.text)
    .filter((text, index, all) => all.indexOf(text) === index)
    .slice(0, limit);
}
