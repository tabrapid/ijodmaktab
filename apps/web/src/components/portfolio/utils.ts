import {
  ACHIEVEMENT_LEVEL_LABELS,
  CREATIVE_PORTFOLIO_TYPES,
  type AchievementLevel,
  type PortfolioItemType,
  type PortfolioStatus,
} from '@ijod/shared';
import type { PortfolioItemView } from '@/lib/types';

/** Portfolio ma’lumotlarining so‘rov kalitlari: barchasi ['portfolio', ...] bilan boshlanadi. */
export const portfolioKeys = {
  all: ['portfolio'] as const,
  mineList: (params: object) => ['portfolio', 'mine', 'list', params] as const,
  mineCounts: ['portfolio', 'mine', 'counts'] as const,
  item: (id: string) => ['portfolio', 'item', id] as const,
  reviewQueue: ['portfolio', 'review-queue'] as const,
  school: (params: object) => ['portfolio', 'school', params] as const,
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

/** O‘zgarsa tasdiqlangan yozuv qayta tasdiqlanishi kerak bo‘lgan maydonlar (server bilan bir xil). */
export const KEY_FIELDS = [
  'type',
  'title',
  'subjectId',
  'organization',
  'date',
  'level',
  'result',
  'evidenceFileId',
  'evidenceUrl',
] as const;
export type KeyField = (typeof KEY_FIELDS)[number];

const normalize = (value: unknown) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return value ?? null;
};

/** Forma qiymatlari yozuvning muhim maydonlaridan farq qiladimi. */
export function keyFieldsChanged(item: PortfolioItemView, values: Partial<Record<KeyField, unknown>>) {
  const before: Record<KeyField, unknown> = {
    type: item.type,
    title: item.title,
    subjectId: item.subject?.id ?? null,
    organization: item.organization,
    date: toDateInput(item.date),
    level: item.level,
    result: item.result,
    evidenceFileId: item.evidenceFile?.id ?? null,
    evidenceUrl: item.evidenceUrl,
  };
  return KEY_FIELDS.some((field) => normalize(before[field]) !== normalize(values[field]));
}
