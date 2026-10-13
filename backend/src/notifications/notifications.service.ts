import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { QueryNotificationsDto } from './dto/notification.dto';

const PAGE_SIZE = 20;
const MESSAGE_EVENT = 'message.new';

function toNotificationPayload(info: Record<string, string | null>): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(info).filter(([, value]) => value !== null)) as Prisma.InputJsonObject;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Creates an IN_APP notification and best-effort fans it out to email/push based on user preferences. */
  async createInApp(
    userId: string,
    eventKey: string,
    title: string,
    body: string,
    payload?: Prisma.InputJsonValue,
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        channel: NotificationChannel.IN_APP,
        eventKey,
        title,
        body,
        payload: payload ?? Prisma.JsonNull,
      },
    });

    this.dispatchAuxiliaryChannels(userId, title, body).catch((err) =>
      this.logger.warn(`Auxiliary notification dispatch failed for user ${userId}: ${err.message}`),
    );

    return notification;
  }

  /**
   * A conversation's "new message" update (PRD 5.2): one unread update per conversation, refreshed
   * by each further message instead of piling up; only the first is also sent by e-mail / push.
   */
  async conversationActivity(
    userId: string,
    info: { conversationId: string; designId: string; designTitle: string | null; senderName: string | null },
  ) {
    const title = info.senderName ? `New message from ${info.senderName}` : 'New message';
    const body = info.designTitle ? `About "${info.designTitle}"` : 'You have a new message';
    const payload = toNotificationPayload(info);
    const refreshed = await this.prisma.notification.updateMany({
      where: {
        userId,
        eventKey: MESSAGE_EVENT,
        readAt: null,
        payload: { path: ['conversationId'], equals: info.conversationId },
      },
      data: { title, body, payload, createdAt: new Date() },
    });
    if (refreshed.count === 0) {
      await this.createInApp(userId, MESSAGE_EVENT, title, body, payload);
    }
  }

  /** Reading a conversation also reads its "new message" update. */
  async conversationRead(userId: string, conversationId: string, readAt: Date) {
    await this.prisma.notification.updateMany({
      where: { userId, eventKey: MESSAGE_EVENT, readAt: null, payload: { path: ['conversationId'], equals: conversationId } },
      data: { readAt },
    });
  }

  private async dispatchAuxiliaryChannels(userId: string, title: string, body: string): Promise<void> {
    const [user, preference, deviceTokens] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      this.prisma.userPreference.findUnique({ where: { userId } }),
      this.prisma.deviceToken.findMany({ where: { userId, revokedAt: null } }),
    ]);

    if (user?.email && (preference?.notifyEmailEnabled ?? true)) {
      await this.mail.send(user.email, title, body);
    }

    if ((preference?.notifyPushEnabled ?? true) && deviceTokens.length > 0) {
      // Push delivery is not wired yet. Device tokens are credentials for reaching a device and are
      // never logged.
      this.logger.debug(`[dev push] user=${userId} devices=${deviceTokens.length} title="${title}"`);
    }
  }

  async listForUser(userId: string, query: QueryNotificationsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.limit && query.limit > 0 && query.limit <= 100 ? query.limit : PAGE_SIZE;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return {
      items,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      unreadCount,
    };
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) {
      throw new NotFoundException({ success: false, message: 'Notification not found' });
    }
    if (notification.readAt) {
      return notification;
    }
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
