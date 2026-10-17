import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DesignStatus, Prisma, ProfilePublishStatus, User, UserRole, RequestTargetStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { withDesignPreview } from '../atelier/design-pictures';
import { moveOrders } from '../atelier/order-status';
import { NotificationsService } from '../notifications/notifications.service';
import { QUOTE_DESIGN_SELECT, withQuoteDesignPreview } from '../quotes/quote-view';
import { UploadAccessService } from '../uploads/upload-access.service';
import { ChatGateway } from './chat.gateway';
import { CreateConversationDto, CreateMessageDto, QueryConversationsDto, QueryMessagesDto } from './dto/chat.dto';

const PAGE_SIZE = 20;
const MESSAGE_PAGE_SIZE = 30;

/** A person in a conversation; shown through ConversationsService.person (signed links). */
const PARTICIPANT_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUploadId: true,
  jewelerProfile: { select: { businessName: true, logoUploadId: true } },
} satisfies Prisma.UserSelect;

const MESSAGE_INCLUDE = {
  sender: { select: PARTICIPANT_USER_SELECT },
  // Storage location is internal; clients get a short-lived signed contentUrl instead.
  imageUpload: { select: { id: true, mimeType: true } },
  // A quote card shows the real figures and the design they price (PRD 5.6).
  quote: { include: { design: { select: QUOTE_DESIGN_SELECT } } },
} satisfies Prisma.MessageInclude;

/** The design a conversation is about; its owner tells which participant is the jeweler. */
const CONVERSATION_DESIGN_SELECT = {
  id: true,
  title: true,
  thumbnailUploadId: true,
  previewUploadId: true,
  status: true,
  ownerUserId: true,
} satisfies Prisma.DesignSelect;

const CONVERSATION_INCLUDE = {
  design: { select: CONVERSATION_DESIGN_SELECT },
  participants: { include: { user: { select: PARTICIPANT_USER_SELECT } } },
  messages: { orderBy: { createdAt: 'desc' }, take: 1, include: MESSAGE_INCLUDE },
} satisfies Prisma.ConversationInclude;

type ParticipantUser = Prisma.UserGetPayload<{ select: typeof PARTICIPANT_USER_SELECT }>;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;
type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChatGateway,
    private readonly access: UploadAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Attaches a signed, short-lived URL to message media for the participants who receive it. */
  private withMedia<T extends { imageUpload: { id: string; mimeType: string } | null }>(message: T) {
    return { ...message, imageUpload: message.imageUpload ? this.access.withUrl(message.imageUpload) : null };
  }

  /**
   * A person as the other side of the conversation sees them: their own photo (signed), and the
   * jeweler of the conversation (anyone but the design's owner) by business name and logo.
   */
  private person(user: ParticipantUser, designOwnerId: string) {
    const { jewelerProfile, ...rest } = user;
    const business = user.id !== designOwnerId ? jewelerProfile : null;
    return {
      ...rest,
      avatarUrl: this.access.urlFor(user.avatarUploadId),
      businessName: business?.businessName ?? null,
      logoUrl: this.access.urlFor(business?.logoUploadId),
    };
  }

  /**
   * Sends a message written elsewhere (quote cards, system messages) to the conversation's open
   * sockets in the same shape as messages sent here: sender by business name / logo, media signed.
   */
  async broadcastMessage(messageId: string): Promise<void> {
    const row = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { ...MESSAGE_INCLUDE, conversation: { select: { design: { select: { ownerUserId: true } } } } },
    });
    if (!row) return;
    const { conversation, ...message } = row;
    this.gateway.emitToConversation(message.conversationId, 'message:new', this.present(message, conversation.design.ownerUserId));
  }

  /** A message as participants receive it: signed media, its sender, the quote card's design pictured. */
  private present(message: MessageRow, designOwnerId: string) {
    const { sender, ...rest } = withQuoteDesignPreview(this.withMedia(message), this.access);
    return { ...rest, sender: sender ? this.person(sender, designOwnerId) : null };
  }

  private conversationView(conversation: ConversationRow, unreadCount: number) {
    const { messages, participants, design, ...rest } = conversation;
    const { ownerUserId, ...shownDesign } = design;
    return {
      ...rest,
      design: withDesignPreview(shownDesign, this.access),
      participants: participants.map(({ user, ...participant }) => ({ ...participant, user: this.person(user, ownerUserId) })),
      lastMessage: messages[0] ? this.present(messages[0], ownerUserId) : null,
      unreadCount,
    };
  }

  async assertParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant || participant.leftAt) {
      throw new ForbiddenException({ success: false, message: 'Not a participant of this conversation' });
    }
    return participant;
  }

  /** Unread = messages after my last read that I did not send (SYSTEM messages have no sender). */
  private async unreadCountFor(conversationId: string, userId: string, lastReadAt: Date | null) {
    return this.prisma.message.count({
      where: {
        conversationId,
        OR: [{ senderId: null }, { senderId: { not: userId } }],
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      },
    });
  }

  private async detail(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });
    if (!conversation) {
      throw new NotFoundException({ success: false, message: 'Conversation not found' });
    }
    const me = conversation.participants.find((p) => p.userId === userId);
    const unreadCount = await this.unreadCountFor(conversationId, userId, me?.lastReadAt ?? null);
    return this.conversationView(conversation, unreadCount);
  }

  /** One conversation as the inbox shows it, with each participant's last read time (read ticks). */
  async findOne(conversationId: string, userId: string) {
    await this.assertParticipant(conversationId, userId);
    return this.detail(conversationId, userId);
  }

  async findMany(userId: string, query: QueryConversationsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;

    const filters: Prisma.ConversationWhereInput[] = [{ participants: { some: { userId, leftAt: null } } }];
    if (query.peerUserId) {
      filters.push({ participants: { some: { userId: query.peerUserId } } });
    }
    if (query.designId) {
      filters.push({ designId: query.designId });
    }
    if (query.from || query.to) {
      filters.push({
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      });
    }
    if (query.q) {
      filters.push({
        OR: [
          { design: { title: { contains: query.q, mode: 'insensitive' } } },
          { messages: { some: { body: { contains: query.q, mode: 'insensitive' } } } },
          // The other side by name: a person's name or a jeweler's business name.
          {
            participants: {
              some: {
                userId: { not: userId },
                user: {
                  OR: [
                    { firstName: { contains: query.q, mode: 'insensitive' } },
                    { lastName: { contains: query.q, mode: 'insensitive' } },
                    { jewelerProfile: { businessName: { contains: query.q, mode: 'insensitive' } } },
                  ],
                },
              },
            },
          },
        ],
      });
    }
    const where: Prisma.ConversationWhereInput = { AND: filters };

    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: CONVERSATION_INCLUDE,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const items = await Promise.all(
      rows.map(async (conv) => {
        const me = conv.participants.find((p) => p.userId === userId);
        const unreadCount = await this.unreadCountFor(conv.id, userId, me?.lastReadAt ?? null);
        return this.conversationView(conv, unreadCount);
      }),
    );

    return {
      items,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    };
  }

  private async hasPublishedJewelerProfile(userId: string): Promise<boolean> {
    const profile = await this.prisma.jewelerProfile.findFirst({
      where: { userId, publishStatus: ProfilePublishStatus.PUBLISHED, user: { deletedAt: null } },
      select: { id: true },
    });
    return !!profile;
  }

  /**
   * Conversations are 1:1 and always about a design, between its owner and a listed jeweler:
   *  - the owner may open one with any user that has a PUBLISHED jeweler profile;
   *  - anyone else must be such a jeweler, must talk to the owner, and the design must be
   *    PUBLISHED (an existing conversation is still returned after the design moves on).
   */
  async findOrCreate(user: User, dto: CreateConversationDto) {
    const design = await this.prisma.design.findFirst({
      where: { id: dto.designId, deletedAt: null, owner: { deletedAt: null } },
    });
    if (!design) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }

    const others = Array.from(new Set(dto.participantUserIds)).filter((id) => id !== user.id);
    if (others.length !== 1) {
      throw new BadRequestException({
        success: false,
        message: 'A conversation has exactly one other participant',
      });
    }
    const [otherId] = others;
    const isOwner = design.ownerUserId === user.id;

    if (isOwner) {
      if (!(await this.hasPublishedJewelerProfile(otherId))) {
        throw new ForbiddenException({
          success: false,
          message: 'Conversations can only be opened with a listed jeweler',
        });
      }
    } else {
      if (otherId !== design.ownerUserId) {
        throw new ForbiddenException({
          success: false,
          message: 'A conversation about a design must include its owner',
        });
      }
      if (!user.roles.includes(UserRole.JEWELER) || !(await this.hasPublishedJewelerProfile(user.id))) {
        throw new ForbiddenException({
          success: false,
          message: 'Publish your jeweler profile before contacting designers',
        });
      }
    }

    const participantIds = [user.id, otherId];
    const existing = await this.findExisting(design.id, participantIds);
    if (existing) {
      return this.detail(existing, user.id);
    }

    if (!isOwner && design.status !== DesignStatus.PUBLISHED) {
      throw new ForbiddenException({
        success: false,
        message: 'This design is not open for quotes',
      });
    }

    const created = await this.prisma.conversation.create({
      data: {
        designId: design.id,
        participants: { create: participantIds.map((id) => ({ userId: id })) },
      },
    });

    return this.detail(created.id, user.id);
  }

  private async findExisting(designId: string, participantIds: string[]): Promise<string | null> {
    const candidates = await this.prisma.conversation.findMany({
      where: { designId, participants: { some: { userId: participantIds[0] } } },
      include: { participants: true },
    });
    const targetKey = [...participantIds].sort().join(',');
    const match = candidates.find(
      (c) =>
        c.participants
          .filter((p) => !p.leftAt)
          .map((p) => p.userId)
          .sort()
          .join(',') === targetKey,
    );
    return match?.id ?? null;
  }

  async getMessages(conversationId: string, userId: string, query: QueryMessagesDto) {
    await this.assertParticipant(conversationId, userId);
    const limit = query.limit && query.limit > 0 && query.limit <= 100 ? query.limit : MESSAGE_PAGE_SIZE;

    const [rows, conversation] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: MESSAGE_INCLUDE,
      }),
      this.prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        select: { design: { select: { ownerUserId: true } } },
      }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;
    const ownerUserId = conversation.design.ownerUserId;

    return { items: page.reverse().map((message) => this.present(message, ownerUserId)), nextCursor };
  }

  async createMessage(conversationId: string, userId: string, dto: CreateMessageDto) {
    await this.assertParticipant(conversationId, userId);

    if (dto.type === 'TEXT' && !dto.body) {
      throw new BadRequestException({ success: false, message: 'body is required for TEXT messages' });
    }
    if ((dto.type === 'IMAGE' || dto.type === 'AUDIO') && !dto.imageUploadId) {
      throw new BadRequestException({
        success: false,
        message: 'imageUploadId is required for IMAGE/AUDIO messages',
      });
    }

    if (dto.imageUploadId) {
      // Only the sender's own, ready media can be attached (no re-sharing of other users' files).
      const media = await this.prisma.upload.findFirst({
        where: { id: dto.imageUploadId, ownerUserId: userId, deletedAt: null, status: 'READY' },
        select: { mimeType: true },
      });
      const expectedPrefix = dto.type === 'AUDIO' ? 'audio/' : 'image/';
      if (!media || !media.mimeType.startsWith(expectedPrefix)) {
        throw new BadRequestException({
          success: false,
          message: `imageUploadId must reference your own ${expectedPrefix.slice(0, -1)} upload`,
        });
      }
    }

    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: {
        designId: true,
        design: { select: { ownerUserId: true, title: true } },
        participants: { where: { leftAt: null }, select: { userId: true } },
      },
    });
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          type: dto.type,
          body: dto.body ?? null,
          imageUploadId: dto.imageUploadId ?? null,
        },
        include: MESSAGE_INCLUDE,
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: row.createdAt },
      });
      // The designer answering a submitted quote: that jeweler's order is now under negotiation.
      if (conversation.design.ownerUserId === userId) {
        const jewelers = conversation.participants.map((p) => p.userId).filter((id) => id !== userId);
        if (jewelers.length > 0) {
          await moveOrders(
            tx,
            { designId: conversation.designId, jewelerUserIds: jewelers, openRequestsOnly: true },
            [RequestTargetStatus.QUOTE_SUBMITTED],
            RequestTargetStatus.NEGOTIATING,
          );
        }
      }
      return row;
    });
    const message = this.present(created, conversation.design.ownerUserId);

    this.gateway.emitToConversation(conversationId, 'message:new', message);

    await this.notifyParticipants(conversationId, userId, conversation);

    return message;
  }

  /**
   * The other participants get a "new message" update on their home screen (PRD 5.2). The message
   * is already sent: a failure here is logged and does not fail the request (a retry would send
   * the message twice).
   */
  private async notifyParticipants(
    conversationId: string,
    senderId: string,
    conversation: { designId: string; design: { title: string | null }; participants: { userId: string }[] },
  ): Promise<void> {
    const others = conversation.participants.map((p) => p.userId).filter((id) => id !== senderId);
    if (others.length === 0) {
      return;
    }
    try {
      const [sender, recipients] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: senderId },
          select: { firstName: true, jewelerProfile: { select: { businessName: true } } },
        }),
        // A deleted account is not notified.
        this.prisma.user.findMany({ where: { id: { in: others }, deletedAt: null }, select: { id: true } }),
      ]);
      const senderName = sender?.jewelerProfile?.businessName || sender?.firstName || null;
      for (const recipient of recipients) {
        await this.notifications.conversationActivity(recipient.id, {
          conversationId,
          designId: conversation.designId,
          designTitle: conversation.design.title,
          senderName,
        });
      }
    } catch (err) {
      this.logger.error(`Could not notify participants of conversation ${conversationId}: ${(err as Error).message}`);
    }
  }

  async markRead(conversationId: string, userId: string) {
    const participant = await this.assertParticipant(conversationId, userId);
    const lastReadAt = new Date();
    await this.prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt },
    });

    this.gateway.emitToConversation(conversationId, 'message:read', { conversationId, userId, lastReadAt });
    await this.notifications.conversationRead(userId, conversationId, lastReadAt);

    return { ok: true, lastReadAt };
  }
}
