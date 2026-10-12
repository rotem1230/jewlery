import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DesignStatus, Prisma, ProfilePublishStatus, User, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ChatGateway } from './chat.gateway';
import { CreateConversationDto, CreateMessageDto, QueryConversationsDto, QueryMessagesDto } from './dto/chat.dto';

const PAGE_SIZE = 20;
const MESSAGE_PAGE_SIZE = 30;

const PARTICIPANT_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUploadId: true,
} satisfies Prisma.UserSelect;

const MESSAGE_INCLUDE = {
  sender: { select: PARTICIPANT_USER_SELECT },
  imageUpload: { select: { id: true, bucket: true, objectKey: true, mimeType: true } },
  quote: true,
} satisfies Prisma.MessageInclude;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChatGateway,
  ) {}

  async assertParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) {
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
      include: {
        design: { select: { id: true, title: true, thumbnailUploadId: true, status: true } },
        participants: { include: { user: { select: PARTICIPANT_USER_SELECT } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: MESSAGE_INCLUDE },
      },
    });
    if (!conversation) {
      throw new NotFoundException({ success: false, message: 'Conversation not found' });
    }
    const me = conversation.participants.find((p) => p.userId === userId);
    const unreadCount = await this.unreadCountFor(conversationId, userId, me?.lastReadAt ?? null);
    const { messages, ...rest } = conversation;
    return { ...rest, lastMessage: messages[0] ?? null, unreadCount };
  }

  async findMany(userId: string, query: QueryConversationsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;

    const filters: Prisma.ConversationWhereInput[] = [{ participants: { some: { userId } } }];
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
        include: {
          design: { select: { id: true, title: true, thumbnailUploadId: true, status: true } },
          participants: { include: { user: { select: PARTICIPANT_USER_SELECT } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1, include: MESSAGE_INCLUDE },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const items = await Promise.all(
      rows.map(async (conv) => {
        const me = conv.participants.find((p) => p.userId === userId);
        const unreadCount = await this.unreadCountFor(conv.id, userId, me?.lastReadAt ?? null);
        const { messages, ...rest } = conv;
        return { ...rest, lastMessage: messages[0] ?? null, unreadCount };
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

    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: MESSAGE_INCLUDE,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return { items: page.reverse(), nextCursor };
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

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        type: dto.type,
        body: dto.body ?? null,
        imageUploadId: dto.imageUploadId ?? null,
      },
      include: MESSAGE_INCLUDE,
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    });

    this.gateway.emitToConversation(conversationId, 'message:new', message);

    return message;
  }

  async markRead(conversationId: string, userId: string) {
    const participant = await this.assertParticipant(conversationId, userId);
    const lastReadAt = new Date();
    await this.prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt },
    });

    this.gateway.emitToConversation(conversationId, 'message:read', { conversationId, userId, lastReadAt });

    return { ok: true, lastReadAt };
  }
}
