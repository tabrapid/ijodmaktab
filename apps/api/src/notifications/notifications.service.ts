import { Injectable } from '@nestjs/common';
import type { NotificationType } from '@ijod/shared';
import { notFound } from '../common/errors.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
}

/**
 * Ilova ichidagi bildirishnomalar. Ularda test javoblari, kirish kodi, shaxsiy hujjat
 * raqamlari yoki yopiq fayllar yuborilmaydi — faqat qisqa xabar va sahifaga havola.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(userIds: readonly string[], input: NotificationInput, tx?: Tx) {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    await (tx ?? this.prisma).notification.createMany({
      data: unique.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      })),
    });
  }

  async list(userId: string, unreadOnly: boolean) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, readAt: unreadOnly ? null : undefined },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.unreadCount(userId),
    ]);
    return { items, unread };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.notification.count({ where: { id, userId } });
      if (!exists) throw notFound('Bildirishnoma');
    }
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
