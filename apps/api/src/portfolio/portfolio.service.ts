import { Injectable } from '@nestjs/common';
import {
  PORTFOLIO_ITEM_TYPE_LABELS,
  TEACHER_ONLY_PORTFOLIO_TYPES,
  fullName,
  normalizeForSearch,
  type PortfolioItemType,
  type Role,
  type portfolioItemSchema,
  type portfolioListQuerySchema,
  type portfolioReviewSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole, isStaff } from '../common/auth-user.js';
import { dateOnly } from '../common/dates.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { toJson } from '../common/json.js';
import { pageArgs, toPage } from '../common/pagination.js';
import type { PortfolioItem, Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Out<T extends z.ZodType> = z.output<T>;
type ItemInput = Out<typeof portfolioItemSchema>;

/** O‘zgarsa qayta tasdiqlash talab qilinadigan “muhim” maydonlar. */
const KEY_FIELDS = ['type', 'title', 'subjectId', 'organization', 'date', 'level', 'result', 'evidenceFileId', 'evidenceUrl'] as const;

const itemInclude = {
  owner: {
    select: {
      id: true,
      internalId: true,
      lastName: true,
      firstName: true,
      middleName: true,
      roles: { select: { role: true } },
      enrollments: { where: { endsOn: null, academicYear: { isCurrent: true } }, select: { class: { select: { id: true, name: true } } }, take: 1 },
    },
  },
  reviewer: { select: { id: true, lastName: true, firstName: true, middleName: true } },
  subject: { select: { id: true, name: true } },
  evidenceFile: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
} satisfies Prisma.PortfolioItemInclude;

type ItemWithRelations = Prisma.PortfolioItemGetPayload<{ include: typeof itemInclude }>;

const comparable = (item: PortfolioItem, field: (typeof KEY_FIELDS)[number]) => {
  const value = item[field];
  return value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? null);
};

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ Ruxsatlar

  private ownerRoles(item: ItemWithRelations) {
    return item.owner.roles.map((entry) => entry.role as Role);
  }

  /** O‘quvchi yozuvini sinf rahbari, har qanday yozuvni rahbariyat tasdiqlaydi. O‘zini o‘zi tasdiqlamaydi. */
  private async canReview(viewer: AuthUser, item: ItemWithRelations) {
    if (item.ownerId === viewer.id) return false;
    if (hasRole(viewer, 'DEPUTY', 'SUPER_ADMIN')) return true;
    if (!this.ownerRoles(item).includes('STUDENT') || !hasRole(viewer, 'TEACHER')) return false;
    const homeroom = await this.access.homeroomClassIds(viewer.id);
    const classId = item.owner.enrollments[0]?.class.id;
    return Boolean(classId && homeroom.includes(classId));
  }

  private async canView(viewer: AuthUser, item: ItemWithRelations) {
    if (item.ownerId === viewer.id) return true;
    if (await this.canReview(viewer, item)) return true;
    if (item.visibility !== 'STAFF' || !isStaff(viewer)) return false;
    const ownerIsStudent = this.ownerRoles(item).includes('STUDENT');
    // O‘quvchi yozuvi — uni o‘qitadigan xodimlarga; o‘qituvchi yozuvi — maktab xodimlariga.
    return ownerIsStudent ? this.access.canViewStudent(viewer, item.ownerId) : true;
  }

  private async load(viewer: AuthUser, id: string) {
    const item = await this.prisma.portfolioItem.findUnique({ where: { id }, include: itemInclude });
    if (!item || !(await this.canView(viewer, item))) throw notFound('Portfolio yozuvi');
    return item;
  }

  private async view(viewer: AuthUser, item: ItemWithRelations) {
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
      evidenceUrl: item.evidenceUrl,
      evidenceFile: item.evidenceFile,
      visibility: item.visibility,
      status: item.status,
      returnReason: item.returnReason,
      submittedAt: item.submittedAt,
      reviewedAt: item.reviewedAt,
      reviewer: item.reviewer ? { id: item.reviewer.id, fullName: fullName(item.reviewer) } : null,
      owner: {
        id: item.owner.id,
        internalId: item.owner.internalId,
        fullName: fullName(item.owner),
        className: item.owner.enrollments[0]?.class.name ?? null,
        roles: this.ownerRoles(item),
      },
      isMine: item.ownerId === viewer.id,
      canReview: item.status === 'SUBMITTED' && (await this.canReview(viewer, item)),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  // ------------------------------------------------------------ Ro‘yxatlar

  async list(viewer: AuthUser, query: Out<typeof portfolioListQuerySchema>) {
    const ownerId = query.ownerId ?? viewer.id;
    if (ownerId !== viewer.id) {
      const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, include: { roles: true } });
      if (!owner) throw notFound('Foydalanuvchi');
      const ownerIsStudent = owner.roles.some((role) => role.role === 'STUDENT');
      const allowed = ownerIsStudent ? await this.access.canViewStudent(viewer, ownerId) : isStaff(viewer);
      if (!allowed) throw notFound('Foydalanuvchi');
    }
    const where = this.filters(query, { ownerId });
    const [items, total] = await Promise.all([
      this.prisma.portfolioItem.findMany({ where, include: itemInclude, orderBy: this.order(query), ...pageArgs(query) }),
      this.prisma.portfolioItem.count({ where }),
    ]);
    const visible = [];
    for (const item of items) if (await this.canView(viewer, item)) visible.push(await this.view(viewer, item));
    return toPage(visible, total, query);
  }

  /** Tasdiqlash navbati: sinf rahbari — o‘z sinfi o‘quvchilari, rahbariyat — barcha yozuvlar. */
  async reviewQueue(viewer: AuthUser) {
    const where: Prisma.PortfolioItemWhereInput = { status: 'SUBMITTED', ownerId: { not: viewer.id } };
    if (!hasRole(viewer, 'DEPUTY', 'SUPER_ADMIN')) {
      const homeroom = await this.access.homeroomClassIds(viewer.id);
      if (homeroom.length === 0) return [];
      where.owner = {
        roles: { some: { role: 'STUDENT' } },
        enrollments: { some: { classId: { in: homeroom }, endsOn: null } },
      };
    }
    const items = await this.prisma.portfolioItem.findMany({
      where,
      include: itemInclude,
      orderBy: { submittedAt: 'asc' },
      take: 200,
    });
    return Promise.all(items.map((item) => this.view(viewer, item)));
  }

  /** Rahbariyat uchun maktab bo‘yicha qidiruv (faqat tasdiqlangan yoki barcha holatlar). */
  async schoolList(viewer: AuthUser, query: Out<typeof portfolioListQuerySchema>) {
    if (!hasRole(viewer, 'DEPUTY', 'SUPER_ADMIN')) throw forbidden();
    const where = this.filters(query, {});
    const [items, total] = await Promise.all([
      this.prisma.portfolioItem.findMany({ where, include: itemInclude, orderBy: this.order(query), ...pageArgs(query) }),
      this.prisma.portfolioItem.count({ where }),
    ]);
    return toPage(await Promise.all(items.map((item) => this.view(viewer, item))), total, query);
  }

  private filters(query: Out<typeof portfolioListQuerySchema>, base: Prisma.PortfolioItemWhereInput) {
    const where: Prisma.PortfolioItemWhereInput = { ...base };
    if (query.type) where.type = query.type;
    if (query.level) where.level = query.level;
    if (query.status) where.status = query.status;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.from || query.to) {
      where.date = { gte: query.from ? dateOnly(query.from) : undefined, lte: query.to ? dateOnly(query.to) : undefined };
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
    const item = await this.load(viewer, id);
    const reviews = await this.prisma.portfolioReview.findMany({
      where: { itemId: id },
      orderBy: { createdAt: 'desc' },
      include: { reviewer: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
    });
    return {
      ...(await this.view(viewer, item)),
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
      const file = await this.prisma.fileAsset.findUnique({ where: { id: input.evidenceFileId } });
      if (!file || file.ownerId !== viewer.id || file.status !== 'CLEAN' || file.deletedAt) throw notFound('Fayl');
    }
  }

  private data(input: ItemInput) {
    return {
      type: input.type,
      title: input.title,
      subjectId: input.subjectId ?? null,
      direction: input.direction,
      description: input.description,
      organization: input.organization,
      date: input.date ? dateOnly(input.date) : null,
      level: input.level ?? null,
      result: input.result,
      evidenceUrl: input.evidenceUrl ?? null,
      evidenceFileId: input.evidenceFileId ?? null,
      visibility: input.visibility,
      searchText: normalizeForSearch([input.title, input.direction, input.organization, input.result].filter(Boolean).join(' ')),
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
    const keyChanged = KEY_FIELDS.some((field) => {
      const after = next[field] instanceof Date ? (next[field] as Date).toISOString().slice(0, 10) : (next[field] ?? null);
      return comparable(item, field) !== after;
    });
    // Tasdiqlangan yozuvning muhim maydoni o‘zgarsa — qayta tasdiqlash kerak; yuborilgan yozuv tahrirlansa — qoralamaga qaytadi.
    const status =
      item.status === 'SUBMITTED' || (item.status === 'APPROVED' && keyChanged) ? 'DRAFT' : item.status;
    await this.prisma.portfolioItem.update({
      where: { id },
      data: {
        ...next,
        status,
        ...(status === 'DRAFT' && item.status === 'APPROVED' ? { reviewerId: null, reviewedAt: null } : {}),
      },
    });
    await this.audit.log('portfolio.update', { type: 'PortfolioItem', id }, { keyChanged, statusBefore: item.status, statusAfter: status });
    return this.get(viewer, id);
  }

  async remove(viewer: AuthUser, id: string) {
    const item = await this.prisma.portfolioItem.findUnique({ where: { id } });
    if (!item || item.ownerId !== viewer.id) throw notFound('Portfolio yozuvi');
    if (item.status === 'APPROVED') {
      throw conflict('APPROVED_ITEM', 'Tasdiqlangan yozuvni o‘chirib bo‘lmaydi. Kerak bo‘lsa, rahbariyatga murojaat qiling.');
    }
    await this.prisma.portfolioItem.delete({ where: { id } });
    await this.audit.log('portfolio.delete', { type: 'PortfolioItem', id }, { title: item.title });
    return { ok: true };
  }

  // ------------------------------------------------------------ Tasdiqlash jarayoni

  /** Qoralama → tekshiruvga yuborildi. */
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
    const reviewers = await this.reviewersFor(item);
    await this.notifications.notify(reviewers, {
      type: 'PORTFOLIO_SUBMITTED',
      title: `Tasdiqlash uchun yangi yozuv: ${item.title}`,
      body: fullName(item.owner),
      link: '/portfolio/review',
    });
    await this.audit.log('portfolio.submitted', { type: 'PortfolioItem', id });
    return this.get(viewer, id);
  }

  private async reviewersFor(item: ItemWithRelations) {
    const ids = new Set<string>();
    const classId = item.owner.enrollments[0]?.class.id;
    if (classId && this.ownerRoles(item).includes('STUDENT')) {
      const target = await this.prisma.class.findUnique({ where: { id: classId }, select: { homeroomTeacherId: true } });
      if (target?.homeroomTeacherId) ids.add(target.homeroomTeacherId);
    }
    if (ids.size === 0) {
      const deputies = await this.prisma.user.findMany({
        where: { status: 'ACTIVE', roles: { some: { role: 'DEPUTY' } } },
        select: { id: true },
      });
      for (const deputy of deputies) ids.add(deputy.id);
    }
    ids.delete(item.ownerId);
    return [...ids];
  }

  /** Tasdiqlash yoki sababi bilan tuzatishga qaytarish. Tasdiqlovchi o‘z yozuvini tasdiqlamaydi. */
  async review(viewer: AuthUser, id: string, input: Out<typeof portfolioReviewSchema>) {
    const item = await this.prisma.portfolioItem.findUnique({ where: { id }, include: itemInclude });
    if (!item || !(await this.canView(viewer, item))) throw notFound('Portfolio yozuvi');
    if (!(await this.canReview(viewer, item))) throw forbidden('Bu yozuvni tasdiqlash vakolatingiz yo‘q.');
    if (item.status !== 'SUBMITTED') throw conflict('INVALID_STATUS', 'Yozuv tekshiruvga yuborilmagan.');

    const approved = input.decision === 'APPROVED';
    await this.prisma.$transaction(async (tx) => {
      await tx.portfolioItem.update({
        where: { id },
        data: {
          status: input.decision,
          reviewerId: viewer.id,
          reviewedAt: new Date(),
          returnReason: approved ? null : input.reason,
        },
      });
      await tx.portfolioReview.create({
        data: {
          itemId: id,
          reviewerId: viewer.id,
          decision: input.decision,
          reason: input.reason,
          snapshot: toJson({
            type: item.type,
            title: item.title,
            subjectId: item.subjectId,
            organization: item.organization,
            date: item.date,
            level: item.level,
            result: item.result,
            evidenceFileId: item.evidenceFileId,
            evidenceUrl: item.evidenceUrl,
          }),
        },
      });
      await this.notifications.notify(
        [item.ownerId],
        {
          type: approved ? 'PORTFOLIO_APPROVED' : 'PORTFOLIO_RETURNED',
          title: approved ? `Yozuv tasdiqlandi: ${item.title}` : `Yozuv tuzatishga qaytarildi: ${item.title}`,
          body: approved ? null : input.reason,
          link: `/portfolio/${id}`,
        },
        tx,
      );
      await this.audit.log(approved ? 'portfolio.approved' : 'portfolio.returned', { type: 'PortfolioItem', id }, { reason: input.reason }, { tx });
    });
    return this.get(viewer, id);
  }

  /** Chop etish (PDF) uchun tanlangan yozuvlar: faqat tasdiqlanganlar “tasdiqlangan yutuqlar” bo‘limiga kiradi. */
  async printable(viewer: AuthUser, ownerId: string, itemIds: string[]) {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      include: {
        enrollments: { where: { endsOn: null, academicYear: { isCurrent: true } }, include: { class: true } },
      },
    });
    if (!owner) throw notFound('Foydalanuvchi');
    const items = await this.prisma.portfolioItem.findMany({
      where: { ownerId, id: { in: itemIds } },
      include: itemInclude,
      orderBy: [{ date: 'desc' }],
    });
    const visible = [];
    for (const item of items) if (await this.canView(viewer, item)) visible.push(await this.view(viewer, item));
    if (visible.length === 0) throw notFound('Portfolio yozuvi');
    const school = await this.prisma.school.findUnique({ where: { id: 1 } });
    await this.audit.log('portfolio.printed', { type: 'User', id: ownerId }, { count: visible.length });
    return {
      school: school?.name ?? 'Ijod maktabi',
      owner: { id: owner.id, internalId: owner.internalId, fullName: fullName(owner), className: owner.enrollments[0]?.class.name ?? null },
      approved: visible.filter((item) => item.status === 'APPROVED'),
      unapproved: visible.filter((item) => item.status !== 'APPROVED'),
      generatedAt: new Date(),
    };
  }
}
