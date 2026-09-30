import { CERTIFICATE_PORTFOLIO_TYPES, fullName, type PortfolioItemType } from '@ijod/shared';
import { avatarUrlOf } from '../common/auth-user.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** Sinf rahbari yoki o‘quvchi haqida ko‘rsatish uchun yetarli maydonlar. */
export const personSelect = {
  id: true,
  lastName: true,
  firstName: true,
  middleName: true,
  avatarFileId: true,
} satisfies Prisma.UserSelect;

type Person = Prisma.UserGetPayload<{ select: typeof personSelect }>;

/** Shaxs: ID, F.I.Sh. va profil rasmi manzili. */
export const personView = (person: Person | null | undefined) =>
  person ? { id: person.id, fullName: fullName(person), avatarUrl: avatarUrlOf(person.avatarFileId) } : null;

/** Sinflar tartibi: 11-sinfdan 7-sinfgacha, parallel ichida A, B, D. */
export const CLASS_ORDER = [
  { gradeLevel: 'desc' },
  { section: 'asc' },
  { name: 'asc' },
] satisfies Prisma.ClassOrderByWithRelationInput[];

export interface PortfolioCounts {
  approved: number;
  pending: number;
}

/** O‘quvchilarning tasdiqlangan va tekshiruvdagi portfolio yozuvlari soni — bitta guruhlangan so‘rov. */
export async function portfolioCounts(prisma: PrismaService, ownerIds: readonly string[]) {
  const result = new Map<string, PortfolioCounts>();
  if (ownerIds.length === 0) return result;
  const grouped = await prisma.portfolioItem.groupBy({
    by: ['ownerId', 'status'],
    where: { ownerId: { in: [...ownerIds] }, status: { in: ['APPROVED', 'SUBMITTED'] } },
    _count: { _all: true },
  });
  for (const row of grouped) {
    const counts = result.get(row.ownerId) ?? { approved: 0, pending: 0 };
    if (row.status === 'APPROVED') counts.approved = row._count._all;
    else counts.pending = row._count._all;
    result.set(row.ownerId, counts);
  }
  return result;
}

export const emptyCounts = (): PortfolioCounts => ({ approved: 0, pending: 0 });

/** Bitta o‘quvchining portfoliosi: tasdiqlangan, tekshiruvdagi va tasdiqlangan sertifikatlar soni. */
export async function studentPortfolioSummary(prisma: PrismaService, ownerId: string) {
  const grouped = await prisma.portfolioItem.groupBy({
    by: ['status', 'type'],
    where: { ownerId, status: { in: ['APPROVED', 'SUBMITTED'] } },
    _count: { _all: true },
  });
  const summary = { approved: 0, pending: 0, certificates: 0 };
  for (const row of grouped) {
    if (row.status === 'SUBMITTED') {
      summary.pending += row._count._all;
      continue;
    }
    summary.approved += row._count._all;
    if (CERTIFICATE_PORTFOLIO_TYPES.includes(row.type as PortfolioItemType)) summary.certificates += row._count._all;
  }
  return summary;
}

/** “Yangi” o‘quvchi hisoblanadigan chegaradan boshlab (hozirdan `days` kun oldin). */
export const daysAgo = (days: number, now = Date.now()) => new Date(now - days * 24 * 60 * 60 * 1000);
