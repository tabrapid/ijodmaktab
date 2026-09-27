import { Injectable } from '@nestjs/common';
import {
  PORTFOLIO_CATEGORY_TYPES,
  PORTFOLIO_ITEM_TYPE_LABELS,
  TEACHER_ONLY_PORTFOLIO_TYPES,
  fullName,
  normalizeForSearch,
  portfolioChangesSince,
  portfolioKeyChanges,
  portfolioStoredFields,
  type PortfolioFieldChange,
  type PortfolioItemType,
  type Role,
  type portfolioBatchReviewSchema,
  type portfolioItemSchema,
  type portfolioListQuerySchema,
  type portfolioReviewSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { isStaff } from '../common/auth-user.js';
import { dateOnly } from '../common/dates.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { fromJson, toJson } from '../common/json.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { Prisma, type PortfolioItem } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import { PortfolioAccess, type PortfolioScope } from './portfolio-access.js';
import {
  avatarUrlOf,
  itemInclude,
  ownerFacts,
  ownerSelect,
  snapshotInclude,
  snapshotOf,
  trackedFieldsOf,
  type ItemWithRelations,
} from './portfolio-common.js';

type Out<T extends z.ZodType> = z.output<T>;
type ItemInput = Out<typeof portfolioItemSchema>;
type Decision = 'APPROVED' | 'RETURNED';

/** Tekshiruvchi uchun: yozuv yangimi yoki tasdiqlangandan keyin o‘zgartirilganmi, nima o‘zgardi. */
export interface ReviewInfo {
  changeKind: 'NEW' | 'CHANGED';
  changes: PortfolioFieldChange[];
  lastApprovedAt: Date | null;
  wasReturned: boolean;
  lastReturnReason: string | null;
}

/** Ommaviy qarorda o‘tkazib yuborilgan yozuv sababi. */
export type SkipReason = 'NOT_FOUND' | 'NOT_ALLOWED' | 'NOT_PENDING';

const notPending = () =>
  conflict('NOT_PENDING', 'Yozuv tekshiruvda emas — uni boshqa tasdiqlovchi ko‘rib chiqqan yoki egasi tahrirlagan.');

/** Bildirishnoma sarlavhasi uchun qisqartirish. */
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolioAccess: PortfolioAccess,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ Ko‘rinish

  scope(viewer: AuthUser) {
    return this.portfolioAccess.scope(viewer);
  }

  view(scope: PortfolioScope, item: ItemWithRelations, review?: ReviewInfo) {
    const owner = item.owner;
    return {
      id: item.id,
      type: item.type as PortfolioItemType,
      typeLabel: PORTFOLIO_ITEM_TYPE_LABELS[item.type as PortfolioItemType],
      title: item.title,
      subject: item.subject,
      direction: item.direction,
      description: item.description,
      organization: item.organization,
      date: item.date,
      level: item.level,
      result: item.result,
      details: item.details ?? null,
      evidenceUrl: item.evidenceUrl,
      evidenceFile: item.evidenceFile,
      visibility: item.visibility,
      status: item.status,
      returnReason: item.returnReason,
      submittedAt: item.submittedAt,
      reviewedAt: item.reviewedAt,
      reviewer: item.reviewer ? { id: item.reviewer.id, fullName: fullName(item.reviewer) } : null,
      owner: {
        id: owner.id,
        internalId: owner.internalId,
        fullName: fullName(owner),
        className: owner.enrollments[0]?.class.name ?? null,
        roles: owner.roles.map((entry) => entry.role as Role),
        avatarUrl: avatarUrlOf(owner.avatarFileId),
      },
      isMine: item.ownerId === scope.viewer.id,
      canReview: item.status === 'SUBMITTED' && this.portfolioAccess.canReview(scope, item),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      ...review,
    };
  }

  /**
   * Tekshiruvdagi yozuvlar uchun farq: oxirgi tasdiqlangan snapshot bilan joriy holat (faqat snapshotda
   * saqlangan maydonlar), oxirgi qaror qaytarish bo‘lganmi. Barcha yozuvlar uchun ikkita so‘rov.
   */
  async reviewInfo(items: readonly ItemWithRelations[]): Promise<Map<string, ReviewInfo>> {
    const result = new Map<string, ReviewInfo>();
    const submitted = items.filter((item) => item.status === 'SUBMITTED');
    if (submitted.length === 0) return result;
    const ids = submitted.map((item) => item.id);
    const order: Prisma.PortfolioReviewOrderByWithRelationInput[] = [
      { itemId: 'asc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ];
    const [approvedRows, latestRows] = await Promise.all([
      this.prisma.portfolioReview.findMany({
        where: { itemId: { in: ids }, decision: 'APPROVED' },
        orderBy: order,
        distinct: ['itemId'],
        select: { itemId: true, snapshot: true, createdAt: true },
      }),
      this.prisma.portfolioReview.findMany({
        where: { itemId: { in: ids } },
        orderBy: order,
        distinct: ['itemId'],
        select: { itemId: true, decision: true, reason: true },
      }),
    ]);
    const approved = new Map(approvedRows.map((row) => [row.itemId, row]));
    const latest = new Map(latestRows.map((row) => [row.itemId, row]));

    // Eski snapshotlarda fan va fayl nomlari saqlanmagan bo‘lishi mumkin — ular bitta so‘rov bilan olinadi.
    const snapshots = new Map<string, Record<string, unknown>>();
    const subjectIds = new Set<string>();
    const fileIds = new Set<string>();
    for (const row of approvedRows) {
      const snapshot = fromJson<Record<string, unknown> | null>(row.snapshot);
      if (!snapshot || typeof snapshot !== 'object') continue;
      snapshots.set(row.itemId, snapshot);
      if (typeof snapshot.subjectId === 'string' && !snapshot.subjectName) subjectIds.add(snapshot.subjectId);
      if (typeof snapshot.evidenceFileId === 'string' && !snapshot.evidenceFileName) {
        fileIds.add(snapshot.evidenceFileId);
      }
    }
    const [subjects, files] = await Promise.all([
      subjectIds.size
        ? this.prisma.subject.findMany({ where: { id: { in: [...subjectIds] } }, select: { id: true, name: true } })
        : [],
      fileIds.size
        ? this.prisma.fileAsset.findMany({
            where: { id: { in: [...fileIds] } },
            select: { id: true, originalName: true },
          })
        : [],
    ]);
    const subjectNames = new Map(subjects.map((subject) => [subject.id, subject.name]));
    const fileNames = new Map(files.map((file) => [file.id, file.originalName]));

    for (const item of submitted) {
      const lastApproved = approved.get(item.id);
      const snapshot = snapshots.get(item.id) ?? null;
      const last = latest.get(item.id);
      const changes = lastApproved
        ? portfolioChangesSince(snapshot, trackedFieldsOf(item)).map((change) => {
            // Fan va dalil fayli identifikator emas, nomi bilan ko‘rsatiladi.
            if (change.field === 'subjectId') {
              const before = snapshot?.subjectId;
              return {
                ...change,
                before:
                  (snapshot?.subjectName as string | undefined) ?? subjectNames.get(String(before)) ?? before ?? null,
                after: item.subject?.name ?? null,
              };
            }
            if (change.field === 'evidenceFileId') {
              const before = snapshot?.evidenceFileId;
              return {
                ...change,
                before:
                  (snapshot?.evidenceFileName as string | undefined) ??
                  (before ? (fileNames.get(String(before)) ?? 'Fayl') : null),
                after: item.evidenceFile?.originalName ?? null,
              };
            }
            return change;
          })
        : [];
      result.set(item.id, {
        changeKind: lastApproved ? 'CHANGED' : 'NEW',
        changes,
        lastApprovedAt: lastApproved?.createdAt ?? null,
        wasReturned: last?.decision === 'RETURNED',
        lastReturnReason: last?.decision === 'RETURNED' ? last.reason : null,
      });
    }
    return result;
  }

  /** Ro‘yxat ko‘rinishi; tekshiruvchiga tekshiruvdagi yozuvlar farqi bilan. */
  async views(scope: PortfolioScope, items: readonly ItemWithRelations[]) {
    const reviewable = items.filter((item) => this.portfolioAccess.canReview(scope, item));
    const info = await this.reviewInfo(reviewable);
    return items.map((item) => this.view(scope, item, info.get(item.id)));
  }

  // ------------------------------------------------------------ Ro‘yxatlar

  async list(viewer: AuthUser, query: Out<typeof portfolioListQuerySchema>) {
    const scope = await this.scope(viewer);
    const ownerId = query.ownerId ?? viewer.id;
    const base: Prisma.PortfolioItemWhereInput = { ownerId };
    if (ownerId !== viewer.id) {
      const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: ownerSelect });
      if (!owner) throw notFound('Foydalanuvchi');
      const facts = ownerFacts(owner);
      const reviewer = this.portfolioAccess.canReviewOwner(scope, facts);
      if (!reviewer && !this.portfolioAccess.canSeeOwnerAsStaff(scope, facts)) throw notFound('Foydalanuvchi');
      // Tekshiruvchi bo‘lmagan xodim faqat “maktab xodimlari” ko‘rinishidagi yozuvlarni ko‘radi —
      // jami son va sahifalash ham shunga mos bo‘lishi uchun filtr so‘rovning o‘zida.
      if (!reviewer) base.visibility = 'STAFF';
    }
    const where = this.filters(query, base);
    const [items, total] = await Promise.all([
      this.prisma.portfolioItem.findMany({
        where,
        include: itemInclude,
        orderBy: this.order(query),
        ...pageArgs(query),
      }),
      this.prisma.portfolioItem.count({ where }),
    ]);
    const visible = items.filter((item) => this.portfolioAccess.canView(scope, item));
    return toPage(await this.views(scope, visible), total, query);
  }

  /** Tekshiruv navbati doirasi: sinf rahbari — o‘z sinfi o‘quvchilari, rahbariyat — barcha yozuvlar. */
  private queueWhere(scope: PortfolioScope): Prisma.PortfolioItemWhereInput | null {
    const where: Prisma.PortfolioItemWhereInput = { status: 'SUBMITTED', ownerId: { not: scope.viewer.id } };
    if (scope.leadership) return where;
    if (!scope.teacher || scope.homeroom.size === 0) return null;
    where.owner = {
      roles: { some: { role: 'STUDENT' } },
      enrollments: {
        some: { classId: { in: [...scope.homeroom] }, endsOn: null, academicYear: { isCurrent: true } },
      },
    };
    return where;
  }

  /**
   * Tasdiqlash navbati. `ownerId` berilsa — shu egasining barcha tekshiruvdagi yozuvlari (egasi
   * tekshiruvchi doirasida bo‘lishi shart), aks holda eski ko‘rinish: umumiy ro‘yxat.
   */
  async reviewQueue(viewer: AuthUser, ownerId?: string) {
    const scope = await this.scope(viewer);
    if (ownerId) {
      const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: ownerSelect });
      if (!owner || !this.portfolioAccess.canReviewOwner(scope, ownerFacts(owner))) throw notFound('Foydalanuvchi');
      const items = await this.prisma.portfolioItem.findMany({
        where: { ownerId, status: 'SUBMITTED' },
        include: itemInclude,
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      });
      return this.views(scope, items);
    }
    const where = this.queueWhere(scope);
    if (!where) return [];
    const items = await this.prisma.portfolioItem.findMany({
      where,
      include: itemInclude,
      orderBy: { submittedAt: 'asc' },
      take: 200,
    });
    return this.views(scope, items);
  }

  /**
   * Tekshiruv navbati o‘quvchilar (egalar) bo‘yicha: nechta yozuv kutmoqda, ulardan nechtasi yangi va
   * nechtasi tasdiqlangandan keyin o‘zgartirilgan. Hisob serverda, cheklovsiz.
   */
  async reviewQueueByOwner(viewer: AuthUser) {
    const scope = await this.scope(viewer);
    let filter = Prisma.sql`TRUE`;
    if (!scope.leadership) {
      if (!scope.teacher || scope.homeroom.size === 0) return [];
      filter = Prisma.sql`EXISTS (SELECT 1 FROM "RoleAssignment" ra WHERE ra."userId" = p."ownerId" AND ra.role = 'STUDENT')
        AND EXISTS (
          SELECT 1 FROM "Enrollment" e JOIN "AcademicYear" y ON y.id = e."academicYearId"
          WHERE e."studentId" = p."ownerId" AND e."endsOn" IS NULL AND y."isCurrent"
            AND e."classId" = ANY(${[...scope.homeroom]}::uuid[])
        )`;
    }
    const rows = await this.prisma.$queryRaw<
      { ownerId: string; pending: number; changedCount: number; oldest: Date | null; latest: Date | null }[]
    >`
      WITH queue AS (
        SELECT p."ownerId", COALESCE(p."submittedAt", p."updatedAt") AS "sentAt",
               EXISTS (
                 SELECT 1 FROM "PortfolioReview" r WHERE r."itemId" = p.id AND r.decision = 'APPROVED'
               ) AS changed
        FROM "PortfolioItem" p
        WHERE p.status = 'SUBMITTED' AND p."ownerId" <> ${scope.viewer.id}::uuid AND ${filter}
      )
      SELECT "ownerId", COUNT(*)::int AS pending,
             COUNT(*) FILTER (WHERE changed)::int AS "changedCount",
             MIN("sentAt") AS oldest, MAX("sentAt") AS latest
      FROM queue
      GROUP BY "ownerId"
      ORDER BY MIN("sentAt") ASC, "ownerId" ASC`;
    if (rows.length === 0) return [];
    const owners = await this.prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.ownerId) } },
      select: ownerSelect,
    });
    const byId = new Map(owners.map((owner) => [owner.id, owner]));
    return rows.flatMap((row) => {
      const owner = byId.get(row.ownerId);
      if (!owner) return [];
      return [
        {
          owner: {
            id: owner.id,
            internalId: owner.internalId,
            fullName: fullName(owner),
            className: owner.enrollments[0]?.class.name ?? null,
            roles: owner.roles.map((entry) => entry.role as Role),
            avatarUrl: avatarUrlOf(owner.avatarFileId),
          },
          pending: row.pending,
          newCount: row.pending - row.changedCount,
          changedCount: row.changedCount,
          oldestSubmittedAt: row.oldest,
          lastSubmittedAt: row.latest,
        },
      ];
    });
  }

  /** Rahbariyat uchun maktab bo‘yicha qidiruv (faqat tasdiqlangan yoki barcha holatlar). */
  async schoolList(viewer: AuthUser, query: Out<typeof portfolioListQuerySchema>) {
    const scope = await this.scope(viewer);
    if (!scope.leadership) throw forbidden();
    const where = this.filters(query, query.ownerId ? { ownerId: query.ownerId } : {});
    const [items, total] = await Promise.all([
      this.prisma.portfolioItem.findMany({
        where,
        include: itemInclude,
        orderBy: this.order(query),
        ...pageArgs(query),
      }),
      this.prisma.portfolioItem.count({ where }),
    ]);
    return toPage(await this.views(scope, items), total, query);
  }

  private filters(query: Out<typeof portfolioListQuerySchema>, base: Prisma.PortfolioItemWhereInput) {
    const where: Prisma.PortfolioItemWhereInput = { ...base };
    if (query.type) where.type = query.type;
    else if (query.category) where.type = { in: [...PORTFOLIO_CATEGORY_TYPES[query.category]] };
    if (query.level) where.level = query.level;
    if (query.status) where.status = query.status;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.from || query.to) {
      where.date = {
        gte: query.from ? dateOnly(query.from) : undefined,
        lte: query.to ? dateOnly(query.to) : undefined,
      };
    }
    if (query.q) where.searchText = { contains: normalizeForSearch(query.q) };
    return where;
  }

  private order(query: Out<typeof portfolioListQuerySchema>): Prisma.PortfolioItemOrderByWithRelationInput[] {
    switch (query.sort) {
      case 'level':
        return [{ level: { sort: query.order, nulls: 'last' } }, { date: 'desc' }];
      case 'owner':
        return [{ owner: { lastName: query.order } }, { date: 'desc' }];
      case 'updatedAt':
        return [{ updatedAt: query.order }];
      default:
        return [{ date: { sort: query.order, nulls: 'last' } }, { createdAt: 'desc' }];
    }
  }

  async get(viewer: AuthUser, id: string) {
    const scope = await this.scope(viewer);
    const item = await this.prisma.portfolioItem.findUnique({ where: { id }, include: itemInclude });
    if (!item || !this.portfolioAccess.canView(scope, item)) throw notFound('Portfolio yozuvi');
    const reviews = await this.prisma.portfolioReview.findMany({
      where: { itemId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { reviewer: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
    });
    const [view] = await this.views(scope, [item]);
    return {
      ...view!,
      reviews: reviews.map((review) => ({
        id: review.id,
        decision: review.decision,
        reason: review.reason,
        createdAt: review.createdAt,
        reviewer: { id: review.reviewer.id, fullName: fullName(review.reviewer) },
      })),
    };
  }

  // ------------------------------------------------------------ Yaratish va tahrirlash

  private async validateInput(viewer: AuthUser, input: ItemInput) {
    if (TEACHER_ONLY_PORTFOLIO_TYPES.includes(input.type) && !isStaff(viewer)) {
      throw badRequest('TYPE_NOT_ALLOWED', 'Bu tur faqat o‘qituvchilar portfoliosi uchun.');
    }
    if (input.evidenceFileId) {
      const file = await this.prisma.fileAsset.findUnique({
        where: { id: input.evidenceFileId },
        select: { ownerId: true, status: true, deletedAt: true, avatarOf: { select: { id: true } } },
      });
      // Profil rasmi dalil sifatida ishlatilmaydi (u boshqa ruxsat qoidalari bilan ochiladi).
      if (!file || file.ownerId !== viewer.id || file.status !== 'CLEAN' || file.deletedAt || file.avatarOf) {
        throw notFound('Fayl');
      }
    }
  }

  private data(input: ItemInput) {
    const stored = portfolioStoredFields(input.type, input.details, input.result);
    return {
      type: input.type,
      title: input.title,
      subjectId: input.subjectId ?? null,
      direction: input.direction,
      description: input.description,
      organization: input.organization,
      date: input.date ? dateOnly(input.date) : null,
      level: input.level ?? null,
      result: stored.result,
      details: stored.details ? toJson(stored.details) : Prisma.DbNull,
      evidenceUrl: input.evidenceUrl ?? null,
      evidenceFileId: input.evidenceFileId ?? null,
      visibility: input.visibility,
      searchText: normalizeForSearch(
        [input.title, input.direction, input.organization, stored.result].filter(Boolean).join(' '),
      ),
    };
  }

  async create(viewer: AuthUser, input: ItemInput) {
    await this.validateInput(viewer, input);
    const item = await this.prisma.portfolioItem.create({ data: { ownerId: viewer.id, ...this.data(input) } });
    await this.audit.log('portfolio.create', { type: 'PortfolioItem', id: item.id }, { type: input.type });
    return this.get(viewer, item.id);
  }

  async update(viewer: AuthUser, id: string, input: ItemInput) {
    const item = await this.prisma.portfolioItem.findUnique({ where: { id } });
    if (!item || item.ownerId !== viewer.id) throw notFound('Portfolio yozuvi');
    await this.validateInput(viewer, input);
    const next = this.data(input);
    const changed = portfolioKeyChanges(trackedFieldsOf(item), trackedFieldsOf(this.asItem(item, next)));
    const keyChanged = changed.length > 0;
    // Tasdiqlangan yozuvning muhim maydoni o‘zgarsa — qayta tasdiqlash kerak; yuborilgan yozuv tahrirlansa — qoralamaga qaytadi.
    const status = item.status === 'SUBMITTED' || (item.status === 'APPROVED' && keyChanged) ? 'DRAFT' : item.status;
    await this.prisma.portfolioItem.update({
      where: { id },
      data: {
        ...next,
        status,
        ...(status === 'DRAFT' && item.status === 'APPROVED' ? { reviewerId: null, reviewedAt: null } : {}),
      },
    });
    await this.audit.log(
      'portfolio.update',
      { type: 'PortfolioItem', id },
      {
        keyChanged,
        changedFields: changed.map((change) => change.field),
        statusBefore: item.status,
        statusAfter: status,
      },
    );
    return this.get(viewer, id);
  }

  /** Saqlanadigan qiymatlarni yozuv ko‘rinishiga keltiradi (solishtirish uchun). */
  private asItem(item: PortfolioItem, next: ReturnType<PortfolioService['data']>): PortfolioItem {
    return { ...item, ...next, details: next.details === Prisma.DbNull ? null : (next.details as Prisma.JsonValue) };
  }

  async remove(viewer: AuthUser, id: string) {
    const item = await this.prisma.portfolioItem.findUnique({ where: { id } });
    if (!item || item.ownerId !== viewer.id) throw notFound('Portfolio yozuvi');
    if (item.status === 'APPROVED') {
      throw conflict(
        'APPROVED_ITEM',
        'Tasdiqlangan yozuvni o‘chirib bo‘lmaydi. Kerak bo‘lsa, rahbariyatga murojaat qiling.',
      );
    }
    await this.prisma.portfolioItem.delete({ where: { id } });
    await this.audit.log('portfolio.delete', { type: 'PortfolioItem', id }, { title: item.title });
    return { ok: true };
  }

  // ------------------------------------------------------------ Tasdiqlash jarayoni

  /** Qoralama → tekshiruvga yuborildi. Tekshiruvchilarga o‘quvchi sahifasiga havola bilan xabar boradi. */
  async submit(viewer: AuthUser, id: string) {
    const item = await this.prisma.portfolioItem.findUnique({ where: { id }, include: itemInclude });
    if (!item || item.ownerId !== viewer.id) throw notFound('Portfolio yozuvi');
    if (item.status !== 'DRAFT' && item.status !== 'RETURNED') {
      throw conflict('INVALID_STATUS', 'Faqat qoralama yoki qaytarilgan yozuv tekshiruvga yuboriladi.');
    }
    await this.prisma.portfolioItem.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), returnReason: null },
    });
    const changed = (await this.prisma.portfolioReview.count({ where: { itemId: id, decision: 'APPROVED' } })) > 0;
    const owner = fullName(item.owner);
    const title = changed ? `${owner}: yutuq o‘zgartirildi` : `${owner}: yangi yutuq tasdiqlash uchun`;
    const body = [item.title, item.result].filter(Boolean).join(' — ');
    const reviewers = await this.reviewersFor(item);
    await this.notifications.notify(reviewers.homeroom, {
      type: 'PORTFOLIO_SUBMITTED',
      title,
      body,
      link: `/portfolio/review?owner=${item.ownerId}`,
    });
    await this.notifications.notify(reviewers.leadership, {
      type: 'PORTFOLIO_SUBMITTED',
      title,
      body,
      link: `/management/portfolio?tab=review&owner=${item.ownerId}`,
    });
    await this.audit.log('portfolio.submitted', { type: 'PortfolioItem', id }, { changed });
    return this.get(viewer, id);
  }

  /**
   * Kimga xabar boradi: o‘quvchi yozuvi — sinf rahbariga; o‘qituvchi yozuvi yoki sinf rahbari
   * bo‘lmasa — rahbariyatga (direktor o‘rinbosarlari).
   */
  private async reviewersFor(item: ItemWithRelations) {
    const facts = ownerFacts(item.owner);
    const homeroom = new Set<string>();
    if (facts.isStudent && facts.classId) {
      const target = await this.prisma.class.findUnique({
        where: { id: facts.classId },
        select: { homeroomTeacherId: true },
      });
      if (target?.homeroomTeacherId) homeroom.add(target.homeroomTeacherId);
    }
    homeroom.delete(item.ownerId);
    const leadership = new Set<string>();
    if (!facts.isStudent || facts.isStaff || homeroom.size === 0) {
      const deputies = await this.prisma.user.findMany({
        where: { status: 'ACTIVE', roles: { some: { role: 'DEPUTY' } } },
        select: { id: true },
      });
      for (const deputy of deputies) if (!homeroom.has(deputy.id)) leadership.add(deputy.id);
    }
    leadership.delete(item.ownerId);
    return { homeroom: [...homeroom], leadership: [...leadership] };
  }

  /**
   * Qarorni shartli qo‘llaydi: yozuv hali ham tekshiruvda bo‘lsagina (ikki tekshiruvchi bir vaqtda
   * bossa, ikkinchisi hech narsani o‘zgartirmaydi). Snapshot aynan qaror qabul qilingan holatdan olinadi.
   */
  private async applyDecision(
    tx: Tx,
    viewer: AuthUser,
    id: string,
    decision: Decision,
    reason: string | null,
    extra: Record<string, unknown> = {},
  ) {
    const approved = decision === 'APPROVED';
    const { count } = await tx.portfolioItem.updateMany({
      where: { id, status: 'SUBMITTED' },
      data: {
        status: decision,
        reviewerId: viewer.id,
        reviewedAt: new Date(),
        returnReason: approved ? null : reason,
      },
    });
    if (count === 0) return null;
    const fresh = await tx.portfolioItem.findUniqueOrThrow({ where: { id }, include: snapshotInclude });
    await tx.portfolioReview.create({
      data: { itemId: id, reviewerId: viewer.id, decision, reason, snapshot: toJson(snapshotOf(fresh)) },
    });
    await this.audit.log(
      approved ? 'portfolio.approved' : 'portfolio.returned',
      { type: 'PortfolioItem', id },
      { reason, ...extra },
      { tx },
    );
    return fresh;
  }

  /** Tasdiqlash yoki sababi bilan tuzatishga qaytarish. Tasdiqlovchi o‘z yozuvini tasdiqlamaydi. */
  async review(viewer: AuthUser, id: string, input: Out<typeof portfolioReviewSchema>) {
    const scope = await this.scope(viewer);
    const item = await this.prisma.portfolioItem.findUnique({ where: { id }, include: itemInclude });
    if (!item || !this.portfolioAccess.canView(scope, item)) throw notFound('Portfolio yozuvi');
    if (!this.portfolioAccess.canReview(scope, item)) throw forbidden('Bu yozuvni tasdiqlash vakolatingiz yo‘q.');
    if (item.status !== 'SUBMITTED') throw notPending();

    const approved = input.decision === 'APPROVED';
    await this.prisma.$transaction(async (tx) => {
      const fresh = await this.applyDecision(tx, viewer, id, input.decision, input.reason);
      if (!fresh) throw notPending();
      await this.notifications.notify(
        [item.ownerId],
        {
          type: approved ? 'PORTFOLIO_APPROVED' : 'PORTFOLIO_RETURNED',
          title: approved ? `Yozuv tasdiqlandi: ${fresh.title}` : `Yozuv tuzatishga qaytarildi: ${fresh.title}`,
          body: approved ? null : input.reason,
          link: `/portfolio/${id}`,
        },
        tx,
      );
    });
    return this.get(viewer, id);
  }

  /**
   * Bir nechta yozuvni bitta tranzaksiyada tasdiqlash yoki qaytarish. Har bir yozuv alohida
   * tekshiriladi; tekshiruvda bo‘lmagan yoki vakolat doirasidan tashqaridagilari o‘tkazib yuboriladi.
   * Har bir egaga bitta umumlashtirilgan bildirishnoma yuboriladi.
   */
  async reviewBatch(viewer: AuthUser, input: Out<typeof portfolioBatchReviewSchema>) {
    const scope = await this.scope(viewer);
    const ids = [...new Set(input.itemIds)];
    const items = await this.prisma.portfolioItem.findMany({ where: { id: { in: ids } }, include: itemInclude });
    const byId = new Map(items.map((item) => [item.id, item]));
    const skipped: { id: string; reason: SkipReason }[] = [];
    const candidates: ItemWithRelations[] = [];
    for (const id of ids) {
      const item = byId.get(id);
      if (!item || !this.portfolioAccess.canView(scope, item)) skipped.push({ id, reason: 'NOT_FOUND' });
      else if (!this.portfolioAccess.canReview(scope, item)) skipped.push({ id, reason: 'NOT_ALLOWED' });
      else if (item.status !== 'SUBMITTED') skipped.push({ id, reason: 'NOT_PENDING' });
      else candidates.push(item);
    }

    const approved = input.decision === 'APPROVED';
    let handled = 0;
    if (candidates.length > 0) {
      await this.prisma.$transaction(
        async (tx) => {
          const byOwner = new Map<string, { id: string; title: string }[]>();
          for (const item of candidates) {
            const fresh = await this.applyDecision(tx, viewer, item.id, input.decision, input.reason, {
              batch: true,
            });
            if (!fresh) {
              skipped.push({ id: item.id, reason: 'NOT_PENDING' });
              continue;
            }
            handled += 1;
            const group = byOwner.get(item.ownerId) ?? [];
            group.push({ id: item.id, title: fresh.title });
            byOwner.set(item.ownerId, group);
          }
          for (const [ownerId, group] of byOwner) {
            await this.notifications.notify([ownerId], this.batchNotice(group, approved, input.reason), tx);
          }
        },
        { timeout: 60_000 },
      );
    }
    return { approved: approved ? handled : 0, returned: approved ? 0 : handled, skipped };
  }

  private batchNotice(group: { id: string; title: string }[], approved: boolean, reason: string | null) {
    const single = group.length === 1 ? group[0]! : null;
    const titles = group.map((entry) => entry.title).join('; ');
    if (approved) {
      return {
        type: 'PORTFOLIO_APPROVED' as const,
        title: single ? `Yozuv tasdiqlandi: ${single.title}` : `${group.length} ta yutuq tasdiqlandi`,
        body: single ? null : titles,
        link: single ? `/portfolio/${single.id}` : '/portfolio',
      };
    }
    return {
      type: 'PORTFOLIO_RETURNED' as const,
      title: single
        ? `Yozuv tuzatishga qaytarildi: ${single.title}`
        : `${group.length} ta yozuv tuzatishga qaytarildi: ${clip(reason ?? '', 120)}`,
      body: single ? reason : `Sabab: ${reason ?? '—'}. Yozuvlar: ${titles}`,
      link: single ? `/portfolio/${single.id}` : '/portfolio?status=RETURNED',
    };
  }

  /** Chop etish (PDF) uchun tanlangan yozuvlar: faqat tasdiqlanganlar “tasdiqlangan yutuqlar” bo‘limiga kiradi. */
  async printable(viewer: AuthUser, ownerId: string, itemIds: string[]) {
    const scope = await this.scope(viewer);
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: ownerSelect });
    if (!owner) throw notFound('Foydalanuvchi');
    const items = await this.prisma.portfolioItem.findMany({
      where: { ownerId, id: { in: itemIds } },
      include: itemInclude,
      orderBy: [{ date: 'desc' }],
    });
    const visible = items
      .filter((item) => this.portfolioAccess.canView(scope, item))
      .map((item) => this.view(scope, item));
    if (visible.length === 0) throw notFound('Portfolio yozuvi');
    const school = await this.prisma.school.findUnique({ where: { id: 1 } });
    await this.audit.log('portfolio.printed', { type: 'User', id: ownerId }, { count: visible.length });
    return {
      school: school?.name ?? 'Ijod maktabi',
      owner: {
        id: owner.id,
        internalId: owner.internalId,
        fullName: fullName(owner),
        className: owner.enrollments[0]?.class.name ?? null,
        roles: owner.roles.map((entry) => entry.role as Role),
        avatarUrl: avatarUrlOf(owner.avatarFileId),
      },
      approved: visible.filter((item) => item.status === 'APPROVED'),
      unapproved: visible.filter((item) => item.status !== 'APPROVED'),
      generatedAt: new Date(),
    };
  }
}
