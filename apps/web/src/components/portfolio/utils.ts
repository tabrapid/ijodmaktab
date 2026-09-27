import {
  ACHIEVEMENT_LEVEL_LABELS,
  CREATIVE_PORTFOLIO_TYPES,
  IELTS_TEST_TYPE_LABELS,
  isStructuredPortfolioType,
  parsePortfolioDetails,
  portfolioKeyChanges,
  portfolioStoredFields,
  type AchievementLevel,
  type CefrDetails,
  type IeltsDetails,
  type NationalCertificateDetails,
  type OlympiadDetails,
  type PortfolioItemInput,
  type PortfolioItemType,
  type PortfolioStatus,
  type SatDetails,
} from '@ijod/shared';
import type { PortfolioItemView } from '@/lib/types';

/** Portfolio ma’lumotlarining so‘rov kalitlari: barchasi ['portfolio', ...] bilan boshlanadi. */
export const portfolioKeys = {
  all: ['portfolio'] as const,
  mineList: (params: object) => ['portfolio', 'mine', 'list', params] as const,
  mineCounts: ['portfolio', 'mine', 'counts'] as const,
  item: (id: string) => ['portfolio', 'item', id] as const,
  reviewQueue: ['portfolio', 'review-queue'] as const,
  reviewGroups: ['portfolio', 'review-queue', 'students'] as const,
  reviewOwner: (ownerId: string) => ['portfolio', 'review-queue', 'owner', ownerId] as const,
  school: (params: object) => ['portfolio', 'school', params] as const,
  students: (params: object) => ['portfolio', 'students', params] as const,
  student: (ownerId: string) => ['portfolio', 'student', ownerId] as const,
  print: (ownerId: string, ids: readonly string[]) => ['portfolio', 'print', ownerId, ids] as const,
};

/** Faol fanlar ro‘yxati (GET /api/subjects). */
export const subjectsKey = ['subjects', 'active'] as const;

/** Tekshiruvga faqat qoralama yoki qaytarilgan yozuv yuboriladi. */
export const canSubmitItem = (status: PortfolioStatus) => status === 'DRAFT' || status === 'RETURNED';

/** Tasdiqlangan yozuvni o‘chirib bo‘lmaydi. */
export const canDeleteItem = (status: PortfolioStatus) => status !== 'APPROVED';

export const isCreativeType = (type: PortfolioItemType) => CREATIVE_PORTFOLIO_TYPES.includes(type);

export const levelLabel = (level: AchievementLevel | null | undefined) =>
  level ? ACHIEVEMENT_LEVEL_LABELS[level] : null;

/** API sanasi (“2026-09-20T00:00:00.000Z”) → `<input type="date">` qiymati (“2026-09-20”). */
export const toDateInput = (value: string | null | undefined) => (value ? value.slice(0, 10) : null);

/** 2 400 000 → “2,3 MB”. */
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export const printHref = (ownerId: string, ids: readonly string[]) =>
  `/portfolio/print?owner=${encodeURIComponent(ownerId)}&ids=${ids.map(encodeURIComponent).join(',')}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string | null | undefined): value is string => Boolean(value && UUID.test(value));

/** Tashqi havola faqat http(s) bo‘lsa ochiladi. */
export function safeExternalUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : value);

/** Yozuvning muhim maydonlari (serverdagi ko‘rinishda). */
function itemKeyFields(item: PortfolioItemView) {
  return {
    type: item.type,
    title: item.title,
    subjectId: item.subject?.id ?? null,
    organization: item.organization,
    date: toDateInput(item.date),
    level: item.level,
    result: item.result,
    details: item.details,
    evidenceFileId: item.evidenceFile?.id ?? null,
    evidenceUrl: item.evidenceUrl,
  };
}

/**
 * Forma qiymatlari server saqlaydigan ko‘rinishga keltiriladi: tuzilgan turlarda natija details dan
 * yasaladi, boshqa turlarda details saqlanmaydi (server bilan bir xil qoida — @ijod/shared).
 */
function formKeyFields(values: Partial<PortfolioItemInput>) {
  const stored = values.type ? portfolioStoredFields(values.type, values.details, values.result) : null;
  return {
    type: values.type,
    title: trimmed(values.title),
    subjectId: values.subjectId ?? null,
    organization: trimmed(values.organization),
    date: values.date ?? null,
    level: values.level ?? null,
    result: stored?.valid ? stored.result : trimmed(values.result),
    details: stored?.valid ? stored.details : (values.details ?? null),
    evidenceFileId: values.evidenceFileId ?? null,
    evidenceUrl: trimmed(values.evidenceUrl),
  };
}

/**
 * Forma qiymatlari yozuvning muhim maydonlaridan farq qiladimi (tasdiqlangan yozuv qoralamaga qaytadimi).
 * Tavsif, yo‘nalish va ko‘rinish doirasi hisobga olinmaydi.
 */
export function keyFieldsChanged(item: PortfolioItemView, values: Partial<PortfolioItemInput>) {
  return portfolioKeyChanges(itemKeyFields(item), formKeyFields(values)).length > 0;
}

/**
 * Turga va ma’lumotlarga mos nom taklifi: “IELTS Academic — 7.5”, “Milliy sertifikat — Matematika (A+)”.
 * Ma’lumotlar yetarli bo‘lmasa null.
 */
export function suggestTitle(
  type: PortfolioItemType | '' | undefined,
  details: unknown,
  level?: AchievementLevel | null,
): string | null {
  if (!type || !isStructuredPortfolioType(type)) return null;
  const parsed = parsePortfolioDetails(type, details);
  if (!parsed.success || !parsed.data) return null;
  switch (type) {
    case 'NATIONAL_CERTIFICATE': {
      const value = parsed.data as NationalCertificateDetails;
      return `Milliy sertifikat — ${value.subject} (${value.grade})`;
    }
    case 'CEFR': {
      const value = parsed.data as CefrDetails;
      return `CEFR — ${value.language} (${value.level})`;
    }
    case 'IELTS': {
      const value = parsed.data as IeltsDetails;
      return `IELTS ${IELTS_TEST_TYPE_LABELS[value.testType]} — ${value.overall}`;
    }
    case 'SAT':
      return `SAT — ${(parsed.data as SatDetails).total}`;
    case 'OLYMPIAD': {
      const value = parsed.data as OlympiadDetails;
      const stage = level ? ` — ${ACHIEVEMENT_LEVEL_LABELS[level].toLowerCase()} bosqichi` : '';
      return `${value.subject} fan olimpiadasi${stage}`;
    }
  }
}

/** Tashkilot takliflari (forma maydoni ostidagi ro‘yxat). Birinchisi bo‘sh maydonga avtomatik qo‘yiladi. */
export const ORGANIZATION_SUGGESTIONS: Partial<Record<PortfolioItemType, readonly string[]>> = {
  NATIONAL_CERTIFICATE: ['Bilim va malakalarni baholash agentligi'],
  IELTS: ['British Council', 'IDP'],
  SAT: ['College Board'],
  CEFR: ['Bilim va malakalarni baholash agentligi', 'Cambridge English', 'Goethe-Institut', 'British Council (Aptis)'],
};

/** Avtomatik to‘ldiriladigan tashkilot (bir xil javob bo‘lgan turlar uchun). */
export const DEFAULT_ORGANIZATION: Partial<Record<PortfolioItemType, string>> = {
  NATIONAL_CERTIFICATE: 'Bilim va malakalarni baholash agentligi',
  SAT: 'College Board',
};

/** CEFR imtihon turlari (taklif). */
export const CEFR_PROVIDERS = [
  'Multilevel',
  'Aptis',
  'Linguaskill',
  'Cambridge (FCE/CAE)',
  'Goethe-Zertifikat',
  'TestDaF',
  'DELF/DALF',
  'TOPIK',
  'HSK',
  'JLPT',
];
