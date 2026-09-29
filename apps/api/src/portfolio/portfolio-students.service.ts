import { Injectable } from '@nestjs/common';
import {
  CERTIFICATE_PORTFOLIO_TYPES,
  PORTFOLIO_ITEM_TYPES,
  PORTFOLIO_ITEM_TYPE_LABELS,
  STRUCTURED_PORTFOLIO_TYPES,
  formatDateTime,
  formatInternalId,
  fullName,
  normalizeForSearch,
  pickPortfolioHighlights,
  type PortfolioItemType,
  type Role,
  type portfolioStudentsQuerySchema,
} from '@ijod/shared';
import type { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { notFound } from '../common/errors.js';
import { toPage } from '../common/pagination.js';
import { addTableSheet, newWorkbook, workbookToBuffer } from '../common/xlsx.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PortfolioAccess } from './portfolio-access.js';
import { avatarUrlOf, itemInclude, ownerFacts, ownerSelect } from './portfolio-common.js';
import { PortfolioService } from './portfolio.service.js';

type StudentsQuery = z.output<typeof portfolioStudentsQuerySchema>;

interface DirectoryRow {
  id: string;
  internalId: number;
  lastName: string;
  firstName: string;
  middleName: string | null;
  avatarFileId: string | null;
  classId: string;
  className: string;
  gradeLevel: number;
  approved: number;
  pending: number;
  draft: number;
  returned: number;
  certificates: number;
  olympiads: number;
  lastActivityAt: Date | null;
  total: number;
}

/** Excel eksportida qatorlar chegarasi (butun maktab bemalol sig‘adi). */
const XLSX_ROW_LIMIT = 5000;

const CERTIFICATE_TYPES = Prisma.join(
  CERTIFICATE_PORTFOLIO_TYPES.map((type) => Prisma.sql`${type}::"PortfolioItemType"`),
);

/** LIKE uchun maxsus belgilar ekranlanadi. */
const likePattern = (value: string) => `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

function directoryItem(row: DirectoryRow, highlights: string[]) {
  return {
    id: row.id,
    internalId: row.internalId,
    fullName: fullName(row),
    avatarUrl: avatarUrlOf(row.avatarFileId),
    classId: row.classId,
    className: row.className,
    gradeLevel: row.gradeLevel,
    counts: { approved: row.approved, pending: row.pending, draft: row.draft, returned: row.returned },
    certificates: row.certificates,
    olympiads: row.olympiads,
    highlights,
    lastActivityAt: row.lastActivityAt,
  };
}

export type PortfolioDirectoryItem = ReturnType<typeof directoryItem>;

/**
 * O‘quvchilar portfoliosi: rahbariyat uchun katalog (har o‘quvchi — bitta qator) va bitta
 * o‘quvchining jamlangan portfoliosi.
 */
@Injectable()
export class PortfolioStudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly portfolioAccess: PortfolioAccess,
    private readonly portfolio: PortfolioService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ Katalog

  /**
   * Joriy o‘quv yilida sinfga biriktirilgan barcha faol o‘quvchilar (yozuvi yo‘qlari ham) va ularning
   * portfolio ko‘rsatkichlari. Hisob, filtr, saralash va sahifalash — bitta SQL so‘rovda.
   * O‘qituvchi faqat o‘zi sinf rahbari bo‘lgan sinflar o‘quvchilarini ko‘radi.
   */
  async directory(viewer: AuthUser, query: StudentsQuery, limit?: number) {
    const empty = toPage<PortfolioDirectoryItem>([], 0, query);
    const scope = await this.portfolioAccess.scope(viewer);
    const year = await this.access.currentYear();
    if (!year) return empty;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`u.status = 'ACTIVE'`,
      Prisma.sql`EXISTS (SELECT 1 FROM "RoleAssignment" ra WHERE ra."userId" = u.id AND ra.role = 'STUDENT')`,
    ];
    if (!scope.leadership) {
      if (scope.homeroom.size === 0) return empty;
      conditions.push(Prisma.sql`c.id = ANY(${[...scope.homeroom]}::uuid[])`);
    }
    if (query.classId) conditions.push(Prisma.sql`c.id = ${query.classId}::uuid`);
    if (query.gradeLevel) conditions.push(Prisma.sql`c."gradeLevel" = ${query.gradeLevel}`);
    if (query.q) {
      const needle = normalizeForSearch(query.q);
      const digits = /^\d{1,9}$/.test(needle) ? Number(needle) : null;
      conditions.push(
        digits === null
          ? Prisma.sql`u."searchText" LIKE ${likePattern(needle)}`
          : Prisma.sql`(u."searchText" LIKE ${likePattern(needle)} OR u."internalId" = ${digits})`,
      );
    }

    const having: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (query.pending === true) having.push(Prisma.sql`COALESCE(s.pending, 0) > 0`);
    if (query.type) {
      having.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "PortfolioItem" t
        WHERE t."ownerId" = b.id AND t.status = 'APPROVED' AND t.type = ${query.type}::"PortfolioItemType"
      )`);
    }

    const direction = Prisma.raw(query.order === 'desc' ? 'DESC' : 'ASC');
    const byName = Prisma.sql`"lastName" ASC, "firstName" ASC, "middleName" ASC NULLS FIRST`;
    const orderBy = {
      name: Prisma.sql`"lastName" ${direction}, "firstName" ${direction}, "middleName" ${direction} NULLS FIRST`,
      class: Prisma.sql`"gradeLevel" ${direction}, "className" ${direction}, ${byName}`,
      approved: Prisma.sql`approved ${direction}, ${byName}`,
      pending: Prisma.sql`pending ${direction}, ${byName}`,
      lastActivity: Prisma.sql`"lastActivityAt" ${direction} NULLS LAST, ${byName}`,
    }[query.sort];
    const take = limit ?? query.pageSize;
    const skip = limit ? 0 : (query.page - 1) * query.pageSize;

    const rows = await this.prisma.$queryRaw<DirectoryRow[]>`
      WITH base AS (
        SELECT u.id, u."internalId", u."lastName", u."firstName", u."middleName", u."avatarFileId",
               c.id AS "classId", c.name AS "className", c."gradeLevel"
        FROM "User" u
        JOIN "Enrollment" e ON e."studentId" = u.id AND e."endsOn" IS NULL AND e."academicYearId" = ${year.id}::uuid
        JOIN "Class" c ON c.id = e."classId"
        WHERE ${Prisma.join(conditions, ' AND ')}
      ),
      stats AS (
        SELECT p."ownerId",
               COUNT(*) FILTER (WHERE p.status = 'APPROVED')::int AS approved,
               COUNT(*) FILTER (WHERE p.status = 'SUBMITTED')::int AS pending,
               COUNT(*) FILTER (WHERE p.status = 'DRAFT')::int AS draft,
               COUNT(*) FILTER (WHERE p.status = 'RETURNED')::int AS returned,
               COUNT(*) FILTER (WHERE p.status = 'APPROVED' AND p.type IN (${CERTIFICATE_TYPES}))::int AS certificates,
               COUNT(*) FILTER (WHERE p.status = 'APPROVED' AND p.type = 'OLYMPIAD')::int AS olympiads,
               MAX(p."updatedAt") AS "lastActivityAt"
        FROM "PortfolioItem" p
        WHERE p."ownerId" IN (SELECT id FROM base)
        GROUP BY p."ownerId"
      ),
      filtered AS (
        SELECT b.*,
               COALESCE(s.approved, 0) AS approved, COALESCE(s.pending, 0) AS pending,
               COALESCE(s.draft, 0) AS draft, COALESCE(s.returned, 0) AS returned,
               COALESCE(s.certificates, 0) AS certificates, COALESCE(s.olympiads, 0) AS olympiads,
               s."lastActivityAt"
        FROM base b LEFT JOIN stats s ON s."ownerId" = b.id
        WHERE ${Prisma.join(having, ' AND ')}
      )
      SELECT *, COUNT(*) OVER()::int AS total
      FROM filtered
      ORDER BY ${orderBy}, id ASC
      LIMIT ${take} OFFSET ${skip}`;

    // Sahifadan tashqariga chiqilganda ham jami son to‘g‘ri bo‘lishi uchun.
    let total = rows[0]?.total ?? 0;
    if (rows.length === 0 && skip > 0) {
      const counted = await this.prisma.$queryRaw<{ total: number }[]>`
        WITH base AS (
          SELECT u.id FROM "User" u
          JOIN "Enrollment" e ON e."studentId" = u.id AND e."endsOn" IS NULL AND e."academicYearId" = ${year.id}::uuid
          JOIN "Class" c ON c.id = e."classId"
          WHERE ${Prisma.join(conditions, ' AND ')}
        ),
        stats AS (
          SELECT p."ownerId", COUNT(*) FILTER (WHERE p.status = 'SUBMITTED')::int AS pending
          FROM "PortfolioItem" p WHERE p."ownerId" IN (SELECT id FROM base) GROUP BY p."ownerId"
        )
        SELECT COUNT(*)::int AS total FROM base b LEFT JOIN stats s ON s."ownerId" = b.id
        WHERE ${Prisma.join(having, ' AND ')}`;
      total = counted[0]?.total ?? 0;
    }

    const highlights = await this.highlights(rows.map((row) => row.id));
    const items = rows.map((row) => directoryItem(row, highlights.get(row.id) ?? []));
    return toPage(items, total, query);
  }

  /** Sahifadagi o‘quvchilarning qisqa nishonlari — bitta so‘rov bilan. */
  private async highlights(ownerIds: string[]) {
    const result = new Map<string, string[]>();
    if (ownerIds.length === 0) return result;
    const items = await this.prisma.portfolioItem.findMany({
      where: { ownerId: { in: ownerIds }, status: 'APPROVED', type: { in: [...STRUCTURED_PORTFOLIO_TYPES] } },
      select: { ownerId: true, type: true, details: true },
      orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    const byOwner = new Map<string, { type: PortfolioItemType; details: unknown }[]>();
    for (const item of items) {
      const list = byOwner.get(item.ownerId) ?? [];
      list.push({ type: item.type as PortfolioItemType, details: item.details });
      byOwner.set(item.ownerId, list);
    }
    for (const [ownerId, list] of byOwner) result.set(ownerId, pickPortfolioHighlights(list));
    return result;
  }

  /** Katalog Excel ko‘rinishida (xuddi shu filtrlar bilan). */
  async directoryWorkbook(viewer: AuthUser, query: StudentsQuery) {
    const page = await this.directory(viewer, { ...query, page: 1 }, XLSX_ROW_LIMIT);
    const workbook = newWorkbook();
    addTableSheet(
      workbook,
      'Portfoliolar',
      [
        { header: '№', key: 'index', width: 6 },
        { header: 'F.I.Sh.', key: 'fullName', width: 34 },
        { header: 'Ichki ID', key: 'internalId', width: 10 },
        { header: 'Sinf', key: 'className', width: 8 },
        { header: 'Tasdiqlangan', key: 'approved', width: 13 },
        { header: 'Kutilmoqda', key: 'pending', width: 11 },
        { header: 'Qaytarilgan', key: 'returned', width: 12 },
        { header: 'Qoralama', key: 'draft', width: 10 },
        { header: 'Sertifikatlar', key: 'certificates', width: 13 },
        { header: 'Olimpiadalar', key: 'olympiads', width: 13 },
        { header: 'Asosiy natijalar', key: 'highlights', width: 48 },
        { header: 'Oxirgi faollik', key: 'lastActivityAt', width: 18 },
      ],
      page.items.map((item, index) => ({
        index: index + 1,
        fullName: item.fullName,
        internalId: formatInternalId(item.internalId),
        className: item.className,
        approved: item.counts.approved,
        pending: item.counts.pending,
        returned: item.counts.returned,
        draft: item.counts.draft,
        certificates: item.certificates,
        olympiads: item.olympiads,
        highlights: item.highlights.join(', '),
        lastActivityAt: item.lastActivityAt ? formatDateTime(item.lastActivityAt) : '',
      })),
    );
    await this.audit.log('portfolio.directory_exported', null, {
      count: page.items.length,
      filters: { ...query, page: undefined, pageSize: undefined },
    });
    const date = new Date().toISOString().slice(0, 10);
    return { buffer: await workbookToBuffer(workbook), fileName: `portfoliolar_${date}.xlsx` };
  }

  // ------------------------------------------------------------ Bitta o‘quvchining portfoliosi

  /**
   * Jamlangan portfolio. Egasi — barcha yozuvlari (qoralamalar ham); tekshiruvchi (rahbariyat, sinf
   * rahbari) — tasdiqlangan, tekshiruvdagi va qaytarilgan yozuvlar; o‘quvchini o‘qitadigan boshqa
   * xodim — faqat “maktab xodimlari” ko‘rinishidagi tasdiqlangan yozuvlar. Boshqalarga 404.
   */
  async consolidated(viewer: AuthUser, ownerId: string) {
    const scope = await this.portfolioAccess.scope(viewer);
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: ownerSelect });
    if (!owner) throw notFound('Foydalanuvchi');
    const facts = ownerFacts(owner);
    const self = owner.id === viewer.id;
    const reviewer = this.portfolioAccess.canReviewOwner(scope, facts);
    if (!self && !reviewer && !this.portfolioAccess.canSeeOwnerAsStaff(scope, facts)) throw notFound('Foydalanuvchi');

    const where: Prisma.PortfolioItemWhereInput = self
      ? { ownerId }
      : { ownerId, AND: this.portfolioAccess.visibleWhere(reviewer) };
    const [items, grouped] = await Promise.all([
      this.prisma.portfolioItem.findMany({
        where,
        include: itemInclude,
        orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      }),
      self || reviewer
        ? this.prisma.portfolioItem.groupBy({ by: ['status'], where: { ownerId }, _count: { _all: true } })
        : Promise.resolve(null),
    ]);
    const views = await this.portfolio.views(scope, items);

    const counts = { approved: 0, pending: 0, draft: 0, returned: 0 };
    const key = { APPROVED: 'approved', SUBMITTED: 'pending', DRAFT: 'draft', RETURNED: 'returned' } as const;
    if (grouped) for (const row of grouped) counts[key[row.status]] = row._count._all;
    else for (const item of items) counts[key[item.status]] += 1;

    const byType = PORTFOLIO_ITEM_TYPES.map((type) => ({
      type,
      label: PORTFOLIO_ITEM_TYPE_LABELS[type],
      approved: items.filter((item) => item.type === type && item.status === 'APPROVED').length,
      pending: items.filter((item) => item.type === type && item.status === 'SUBMITTED').length,
    })).filter((row) => row.approved > 0 || row.pending > 0);

    return {
      owner: {
        id: owner.id,
        internalId: owner.internalId,
        fullName: fullName(owner),
        avatarUrl: avatarUrlOf(owner.avatarFileId),
        classId: owner.enrollments[0]?.class.id ?? null,
        className: owner.enrollments[0]?.class.name ?? null,
        roles: owner.roles.map((entry) => entry.role as Role),
      },
      counts,
      byType,
      items: views,
      pendingItems: views.filter((item) => item.status === 'SUBMITTED'),
      canReview: reviewer,
      canExport: self || reviewer,
    };
  }
}
