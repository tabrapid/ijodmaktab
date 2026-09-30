import {
  isStructuredPortfolioType,
  portfolioDetailsSummary,
  type PortfolioItemType,
  type PortfolioTrackedField,
} from '@ijod/shared';
import { isoDateOnly } from '../common/dates.js';
import type { PortfolioItem, Prisma } from '../generated/prisma/client.js';

export { avatarUrlOf } from '../common/auth-user.js';

/** Yozuv egasi: rollari va joriy o‘quv yilidagi sinfi. */
export const ownerSelect = {
  id: true,
  internalId: true,
  lastName: true,
  firstName: true,
  middleName: true,
  avatarFileId: true,
  roles: { select: { role: true } },
  enrollments: {
    where: { endsOn: null, academicYear: { isCurrent: true } },
    select: { class: { select: { id: true, name: true, gradeLevel: true } } },
    take: 1,
  },
} satisfies Prisma.UserSelect;

export type OwnerWithRelations = Prisma.UserGetPayload<{ select: typeof ownerSelect }>;

export const itemInclude = {
  owner: { select: ownerSelect },
  reviewer: { select: { id: true, lastName: true, firstName: true, middleName: true } },
  subject: { select: { id: true, name: true } },
  evidenceFile: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
  /** Sertifikatga ustozlik qilgan o‘qituvchilar (ma’lumotnomaning 10–11-bandlari). */
  mentorships: {
    select: { teacher: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.PortfolioItemInclude;

export type ItemWithRelations = Prisma.PortfolioItemGetPayload<{ include: typeof itemInclude }>;

/** Ruxsat tekshiruvi uchun egasi haqida yetarli ma’lumot. */
export interface OwnerFacts {
  id: string;
  isStudent: boolean;
  /** Xodim (o‘qituvchi, rahbariyat) — yozuvini rahbariyat tasdiqlaydi. */
  isStaff: boolean;
  classId: string | null;
}

export function ownerFacts(owner: OwnerWithRelations): OwnerFacts {
  const roles = owner.roles.map((entry) => entry.role);
  return {
    id: owner.id,
    isStudent: roles.includes('STUDENT'),
    isStaff: roles.some((role) => role !== 'STUDENT'),
    classId: owner.enrollments[0]?.class.id ?? null,
  };
}

/**
 * Ko‘rsatiladigan natija: tuzilgan turda details dan joriy formatda qayta yasaladi — saqlangan matn
 * eski formatda bo‘lsa ham (masalan, “IELTS 7” → “IELTS 7.0”) ro‘yxat, nishon va sarlavha bir xil.
 */
export function resultOf(item: Pick<PortfolioItem, 'type' | 'result' | 'details'>): string | null {
  const type = item.type as PortfolioItemType;
  if (!isStructuredPortfolioType(type)) return item.result;
  return portfolioDetailsSummary(type, item.details) ?? item.result;
}

type TrackedSource = Pick<
  PortfolioItem,
  | 'type'
  | 'title'
  | 'subjectId'
  | 'direction'
  | 'description'
  | 'organization'
  | 'date'
  | 'level'
  | 'result'
  | 'details'
  | 'evidenceFileId'
  | 'evidenceUrl'
  | 'visibility'
>;

/** Kuzatiladigan maydonlar (`portfolioChanges` uchun), sana “YYYY-MM-DD” ko‘rinishida. */
export function trackedFieldsOf(item: TrackedSource): Record<PortfolioTrackedField, unknown> {
  return {
    type: item.type,
    title: item.title,
    subjectId: item.subjectId,
    direction: item.direction,
    description: item.description,
    organization: item.organization,
    date: item.date ? isoDateOnly(item.date) : null,
    level: item.level,
    result: item.result,
    details: item.details ?? null,
    evidenceFileId: item.evidenceFileId,
    evidenceUrl: item.evidenceUrl,
    visibility: item.visibility,
  };
}

/**
 * Tasdiqlash (qaytarish) paytidagi to‘liq holat: barcha kuzatiladigan maydonlar va ko‘rsatish uchun
 * fan hamda dalil fayli nomlari. Keyingi safar “nima o‘zgardi” shu bilan solishtiriladi.
 */
export function snapshotOf(
  item: TrackedSource & { subject: { name: string } | null; evidenceFile: { originalName: string } | null },
) {
  return {
    ...trackedFieldsOf(item),
    subjectName: item.subject?.name ?? null,
    evidenceFileName: item.evidenceFile?.originalName ?? null,
  };
}

export type PortfolioSnapshot = ReturnType<typeof snapshotOf>;

/** Qaror uchun yozuvni qayta o‘qish: snapshot aynan tasdiqlangan holatdan olinadi. */
export const snapshotInclude = {
  subject: { select: { name: true } },
  evidenceFile: { select: { originalName: true } },
} satisfies Prisma.PortfolioItemInclude;
