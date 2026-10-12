import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ContentPageStatus,
  DesignRequestStatus,
  DesignStatus,
  MessageType,
  Prisma,
  QuoteStatus,
  User,
  UserRole,
} from '@prisma/client';
import { toJsonValue } from '../audit/json.util';
import { EventLogService } from '../audit/event-log.service';
import { ChatGateway } from '../chat/chat.gateway';
import { OutboxService } from '../common/outbox/outbox.service';
import { StateMachineService } from '../common/state-machine/state-machine.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateQuoteDto, DeclineQuoteDto, UpdateQuoteDto } from './dto/quote.dto';

const DEFAULT_CURRENCY = 'ILS';

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly outbox: OutboxService,
    private readonly eventLog: EventLogService,
    private readonly notifications: NotificationsService,
    private readonly gateway: ChatGateway,
  ) {}

  private fullName(user: { firstName: string | null; lastName: string | null } | null | undefined): string {
    if (!user) {
      return 'the jeweler';
    }
    const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return name.length > 0 ? name : 'the jeweler';
  }

  private renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? '');
  }

  private toWhatsappUrl(phone: string | null | undefined): string | null {
    if (!phone) {
      return null;
    }
    const digits = phone.replace(/[^\d]/g, '');
    return digits ? `https://wa.me/${digits}` : null;
  }

  private async assertConversationParticipant(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });
    if (!conversation) {
      throw new NotFoundException({ success: false, message: 'Conversation not found' });
    }
    if (!conversation.participants.some((p) => p.userId === userId)) {
      throw new ForbiddenException({ success: false, message: 'Not a participant of this conversation' });
    }
    return conversation;
  }

  async create(user: User, dto: CreateQuoteDto) {
    const conversation = await this.assertConversationParticipant(dto.conversationId, user.id);
    if (conversation.designId !== dto.designId) {
      throw new BadRequestException({
        success: false,
        message: 'designId does not match the conversation design',
      });
    }

    if (dto.designRequestId) {
      const request = await this.prisma.designRequest.findUnique({ where: { id: dto.designRequestId } });
      if (!request) {
        throw new NotFoundException({ success: false, message: 'Design request not found' });
      }
    }

    const materialsCost = new Prisma.Decimal(dto.materialsCost);
    const laborCost = new Prisma.Decimal(dto.laborCost);
    const totalPrice = materialsCost.add(laborCost);

    const disclaimer = await this.prisma.contentPage.findFirst({
      where: { slug: 'quote_disclaimer', locale: 'he', status: ContentPageStatus.PUBLISHED },
      orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
    });

    const { quote, message } = await this.prisma.$transaction(async (tx) => {
      const createdQuote = await tx.quote.create({
        data: {
          conversationId: dto.conversationId,
          designId: dto.designId,
          designRequestId: dto.designRequestId ?? null,
          authorUserId: user.id,
          materialsCost,
          laborCost,
          laborHours: dto.laborHours != null ? new Prisma.Decimal(dto.laborHours) : null,
          totalPrice,
          currency: dto.currency ?? DEFAULT_CURRENCY,
          etaBusinessDays: dto.etaBusinessDays,
          notes: dto.notes ?? null,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          disclaimerPageId: disclaimer?.id ?? null,
        },
      });

      await tx.quoteEvent.create({
        data: { quoteId: createdQuote.id, toStatus: QuoteStatus.PENDING, actorUserId: user.id },
      });

      const createdMessage = await tx.message.create({
        data: {
          conversationId: dto.conversationId,
          senderId: user.id,
          type: MessageType.QUOTE_CARD,
          quoteId: createdQuote.id,
          payload: toJsonValue({
            quoteId: createdQuote.id,
            totalPrice: totalPrice.toString(),
            currency: createdQuote.currency,
            etaBusinessDays: createdQuote.etaBusinessDays,
          }),
        },
        include: { sender: { select: { id: true, firstName: true, lastName: true, avatarUploadId: true } } },
      });

      await tx.conversation.update({
        where: { id: dto.conversationId },
        data: { lastMessageAt: createdMessage.createdAt },
      });

      if (dto.designRequestId) {
        await tx.designRequest.update({
          where: { id: dto.designRequestId },
          data: { status: DesignRequestStatus.QUOTE_SUBMITTED },
        });
      }

      return { quote: createdQuote, message: createdMessage };
    });

    this.gateway.emitToConversation(dto.conversationId, 'message:new', message);

    await this.eventLog.record('quote.created', 'Quote', quote.id, {
      designId: quote.designId,
      conversationId: quote.conversationId,
      authorUserId: user.id,
      totalPrice: totalPrice.toString(),
    });
    await this.outbox.enqueue('quote.created', {
      quoteId: quote.id,
      designId: quote.designId,
      conversationId: quote.conversationId,
    });

    const others = conversation.participants.filter((p) => p.userId !== user.id);
    for (const other of others) {
      await this.notifications.createInApp(
        other.userId,
        'quote.created',
        'New quote received',
        `You received a new quote of ${totalPrice.toString()} ${quote.currency}`,
        { quoteId: quote.id, conversationId: quote.conversationId },
      );
    }

    return this.findOne(quote.id, user);
  }

  async findOne(id: string, user: User) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: {
        disclaimerPage: true,
        author: { select: { id: true, firstName: true, lastName: true } },
        design: { select: { id: true, title: true, thumbnailUploadId: true, status: true } },
        conversation: { include: { participants: true } },
      },
    });
    if (!quote) {
      throw new NotFoundException({ success: false, message: 'Quote not found' });
    }
    const isParticipant = quote.conversation.participants.some((p) => p.userId === user.id);
    if (!isParticipant && !user.roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException({ success: false, message: 'Not authorized to view this quote' });
    }
    const { conversation, ...rest } = quote;
    return rest;
  }

  async accept(id: string, user: User) {
    const existing = await this.prisma.quote.findUnique({
      where: { id },
      include: { conversation: { include: { participants: true } } },
    });
    if (!existing) {
      throw new NotFoundException({ success: false, message: 'Quote not found' });
    }
    if (!existing.conversation.participants.some((p) => p.userId === user.id)) {
      throw new ForbiddenException({ success: false, message: 'Not authorized to accept this quote' });
    }

    if (existing.status === QuoteStatus.ACCEPTED) {
      return this.findOne(id, user);
    }

    this.stateMachine.assertTransition(this.stateMachine.quoteGraph, existing.status, QuoteStatus.ACCEPTED);

    const acceptedAt = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedQuote = await tx.quote.update({
        where: { id },
        data: { status: QuoteStatus.ACCEPTED, acceptedAt },
      });
      await tx.quoteEvent.create({
        data: {
          quoteId: id,
          fromStatus: existing.status,
          toStatus: QuoteStatus.ACCEPTED,
          actorUserId: user.id,
        },
      });

      const design = await tx.design.findUnique({ where: { id: existing.designId } });
      if (design && design.status !== DesignStatus.COMPLETED) {
        this.stateMachine.assertTransition(this.stateMachine.designGraph, design.status, DesignStatus.COMPLETED);
        await tx.design.update({
          where: { id: existing.designId },
          data: {
            status: DesignStatus.COMPLETED,
            completedAt: acceptedAt,
            completedByJewelerId: existing.authorUserId,
            acceptedQuoteId: existing.id,
          },
        });
      }

      const otherPending = await tx.quote.findMany({
        where: { designId: existing.designId, id: { not: id }, status: QuoteStatus.PENDING },
      });
      for (const other of otherPending) {
        await tx.quote.update({
          where: { id: other.id },
          data: { status: QuoteStatus.DECLINED, declinedAt: acceptedAt },
        });
        await tx.quoteEvent.create({
          data: {
            quoteId: other.id,
            fromStatus: QuoteStatus.PENDING,
            toStatus: QuoteStatus.DECLINED,
            actorUserId: user.id,
            note: 'Auto-declined: another quote was accepted for this design',
          },
        });
      }

      const jeweler = await tx.user.findUnique({
        where: { id: existing.authorUserId },
        include: { jewelerProfile: true },
      });
      const phone = jeweler?.jewelerProfile?.phone ?? jeweler?.phone ?? null;
      const whatsappUrl = this.toWhatsappUrl(phone);
      const jewelerName = this.fullName(jeweler);

      const [acceptedTemplate, handoffTemplate] = await Promise.all([
        tx.systemMessageTemplate.findUnique({ where: { eventKey_locale: { eventKey: 'quote.accepted', locale: 'he' } } }),
        tx.systemMessageTemplate.findUnique({ where: { eventKey_locale: { eventKey: 'handoff.created', locale: 'he' } } }),
      ]);

      const templateVars = { jewelerName, whatsappUrl: whatsappUrl ?? '' };
      const acceptedBody = this.renderTemplate(
        acceptedTemplate?.body ?? 'The quote from {{jewelerName}} was accepted.',
        templateVars,
      );
      const handoffBody = this.renderTemplate(
        handoffTemplate?.body ?? 'Continue the handoff with {{jewelerName}} on WhatsApp: {{whatsappUrl}}',
        templateVars,
      );

      const acceptedMsg = await tx.message.create({
        data: {
          conversationId: existing.conversationId,
          senderId: null,
          type: MessageType.SYSTEM,
          body: acceptedBody,
          payload: toJsonValue({ eventKey: 'quote.accepted', quoteId: id }),
        },
      });
      const handoffMsg = await tx.message.create({
        data: {
          conversationId: existing.conversationId,
          senderId: null,
          type: MessageType.SYSTEM,
          body: handoffBody,
          payload: toJsonValue({ eventKey: 'handoff.created', quoteId: id, whatsappUrl }),
        },
      });
      await tx.conversation.update({
        where: { id: existing.conversationId },
        data: { lastMessageAt: handoffMsg.createdAt },
      });

      await tx.eventLog.create({
        data: {
          eventKey: 'quote.accepted',
          entityType: 'Quote',
          entityId: id,
          payload: toJsonValue({
            designId: existing.designId,
            jewelerUserId: existing.authorUserId,
            acceptedAt,
            declinedQuoteIds: otherPending.map((q) => q.id),
          }),
        },
      });

      return { updatedQuote, acceptedMsg, handoffMsg, otherPendingIds: otherPending.map((q) => q.id) };
    });

    this.gateway.emitToConversation(existing.conversationId, 'message:new', result.acceptedMsg);
    this.gateway.emitToConversation(existing.conversationId, 'message:new', result.handoffMsg);

    await this.outbox.enqueue('quote.accepted', {
      quoteId: id,
      designId: existing.designId,
      jewelerUserId: existing.authorUserId,
    });
    await this.outbox.enqueue('handoff.created', {
      quoteId: id,
      designId: existing.designId,
      jewelerUserId: existing.authorUserId,
    });

    const requesterIds = existing.conversation.participants
      .map((p) => p.userId)
      .filter((uid) => uid !== existing.authorUserId);
    for (const requesterId of requesterIds) {
      await this.notifications.createInApp(
        requesterId,
        'quote.accepted',
        'Quote accepted',
        'The quote was accepted. Check the conversation for handoff details.',
        { quoteId: id },
      );
    }
    for (const declinedId of result.otherPendingIds) {
      const declined = await this.prisma.quote.findUnique({ where: { id: declinedId } });
      if (declined) {
        await this.notifications.createInApp(
          declined.authorUserId,
          'quote.declined',
          'Quote declined',
          'Another quote was accepted for this design; your quote was automatically declined.',
          { quoteId: declinedId },
        );
      }
    }

    return this.findOne(id, user);
  }

  async decline(id: string, user: User, dto: DeclineQuoteDto) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: { conversation: { include: { participants: true } } },
    });
    if (!quote) {
      throw new NotFoundException({ success: false, message: 'Quote not found' });
    }
    if (!quote.conversation.participants.some((p) => p.userId === user.id)) {
      throw new ForbiddenException({ success: false, message: 'Not authorized to decline this quote' });
    }

    if (quote.status === QuoteStatus.DECLINED) {
      return this.findOne(id, user);
    }

    this.stateMachine.assertTransition(this.stateMachine.quoteGraph, quote.status, QuoteStatus.DECLINED);

    const declinedAt = new Date();
    await this.prisma.quote.update({ where: { id }, data: { status: QuoteStatus.DECLINED, declinedAt } });
    await this.prisma.quoteEvent.create({
      data: {
        quoteId: id,
        fromStatus: quote.status,
        toStatus: QuoteStatus.DECLINED,
        actorUserId: user.id,
        note: dto.note ?? null,
      },
    });

    await this.eventLog.record('quote.declined', 'Quote', id, { actorUserId: user.id, note: dto.note ?? null });
    await this.notifications.createInApp(
      quote.authorUserId,
      'quote.declined',
      'Quote declined',
      'Your quote was declined.',
      { quoteId: id },
    );

    return this.findOne(id, user);
  }

  async update(id: string, user: User, dto: UpdateQuoteDto) {
    const quote = await this.prisma.quote.findUnique({ where: { id } });
    if (!quote) {
      throw new NotFoundException({ success: false, message: 'Quote not found' });
    }
    if (quote.authorUserId !== user.id && !user.roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException({ success: false, message: 'Only the quote author can edit it' });
    }
    if (quote.status !== QuoteStatus.PENDING) {
      throw new BadRequestException({ success: false, message: 'Only PENDING quotes can be edited' });
    }

    const materialsCost = dto.materialsCost != null ? new Prisma.Decimal(dto.materialsCost) : quote.materialsCost;
    const laborCost = dto.laborCost != null ? new Prisma.Decimal(dto.laborCost) : quote.laborCost;
    const totalPrice = materialsCost.add(laborCost);

    const updated = await this.prisma.quote.update({
      where: { id },
      data: {
        materialsCost,
        laborCost,
        totalPrice,
        laborHours: dto.laborHours != null ? new Prisma.Decimal(dto.laborHours) : undefined,
        etaBusinessDays: dto.etaBusinessDays,
        notes: dto.notes,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        currency: dto.currency,
      },
    });

    await this.eventLog.record('quote.updated', 'Quote', id, { actorUserId: user.id });

    return this.findOne(updated.id, user);
  }
}
