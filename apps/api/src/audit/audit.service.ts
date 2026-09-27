import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole } from '../common/auth-user.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { requestContext } from '../common/request-context.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';

export interface AuditEntity {
  type: string;
  id: string;
}

export interface AuditOptions {
  /** Aniq ko‘rsatilmasa, joriy so‘rov egasi olinadi. `null` — tizim amali. */
  actor?: Pick<AuthUser, 'id' | 'roles'> | null;
  tx?: Tx;
}

/** Xavfsizlik yozuvlari (kirish urinishlari va h.k.) faqat super adminga ko‘rinadi. */
const SECURITY_ACTION_PREFIXES = ['auth.', 'system.'];

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Muhim amalni jurnalga yozadi. Jurnal faqat qo‘shiladi (baza triggeri bilan himoyalangan). */
  async log(action: string, entity?: AuditEntity | null, data?: Record<string, unknown>, options: AuditOptions = {}) {
    const context = requestContext.get();
    const actor = options.actor === undefined ? context?.user : options.actor;
    const client = options.tx ?? this.prisma;
    await client.auditEvent.create({
      data: {
        actorId: actor?.id ?? null,
        actorRoles: actor?.roles ?? [],
        action,
        entityType: entity?.type ?? null,
        entityId: entity?.id ?? null,
        data: (data ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      },
    });
  }

  async list(
    viewer: AuthUser,
    query: {
      actorId?: string;
      action?: string;
      entityType?: string;
      entityId?: string;
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
    },
  ) {
    const where: Prisma.AuditEventWhereInput = {
      actorId: query.actorId,
      entityType: query.entityType,
      entityId: query.entityId,
      action: query.action ? { startsWith: query.action } : undefined,
      createdAt: {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      },
    };
    if (!hasRole(viewer, 'SUPER_ADMIN')) {
      // Rahbariyat va administrator uchun cheklangan audit.
      where.NOT = SECURITY_ACTION_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } }));
    }
    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { id: 'desc' },
        ...pageArgs(query),
        include: { actor: { select: { id: true, internalId: true, lastName: true, firstName: true } } },
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return toPage(
      items.map((event) => ({
        id: event.id.toString(),
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        data: event.data,
        actor: event.actor,
        actorRoles: event.actorRoles,
        ip: event.ip,
        createdAt: event.createdAt,
      })),
      total,
      query,
    );
  }
}
