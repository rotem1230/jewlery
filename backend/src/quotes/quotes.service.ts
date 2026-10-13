import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ContentPageStatus,
  DesignRequestStatus,
  DesignStatus,
  MessageType,
  Prisma,
  Quote,
  QuoteStatus,
  RequestTargetStatus,
  User,
  UserRole,
} from '@prisma/client';
import { toJsonValue } from '../audit/json.util';
import { EventLogService } from '../audit/event-log.service';
import { ChatGateway } from '../chat/chat.gateway';
import { OutboxService } from '../common/outbox/outbox.service';
import { StateMachineService } from '../common/state-machine/state-machine.service';
import { AUTH_ERROR } from '../auth/constants';
import { PrismaService } from '../database/prisma.service';
import { shareLockUser } from '../database/row-locks';
import { moveOrders } from '../atelier/order-status';
import { designFingerprint } from '../designs/design-fingerprint';
import { NotificationsService } from '../notifications/notifications.service';
import { AcceptQuoteDto, CreateQuoteDto, DeclineQuoteDto, MAX_AMOUNT, UpdateQuoteDto } from './dto/quote.dto';
import { QUOTE_AUTHOR_SELECT, QUOTE_DESIGN_SELECT, withBusinessName } from './quote-view';

const DEFAULT_CURRENCY = 'ILS';
const MAX_TOTAL = new Prisma.Decimal(MAX_AMOUNT);
/** Waiting for the design lock counts toward the timeout; leave room for a busy design. */
const DECISION_TX = { maxWait: 5_000, timeout: 15_000 };
/** Pending quotes expired per sweep (the next sweep takes the rest). */
const EXPIRY_BATCH = 200;

/** Chat messages posted when a quote is accepted (PRD 5.6); an operator can reword them. */
const ACCEPTED_MESSAGE = 'ההצעה אושרה בהצלחה! כדי להשלים את התהליך אפשר עכשיו לתאם ישירות עם {{jewelerName}}.';
const HANDOFF_MESSAGE = 'הנה קישור להמשך התקשרות ישירה עם {{jewelerName}}: {{whatsappUrl}}';
/** When the jeweler left no phone number there is no link to give: the chat stays the channel. */
const HANDOFF_WITHOUT_LINK_MESSAGE = 'להמשך התקשרות עם {{jewelerName}} המשיכו בצ׳אט הזה.';

/** Total = materials + labor must still fit the Decimal(12, 2) column. */
function assertStorableTotal(total: Prisma.Decimal): void {
  if (total.greaterThan(MAX_TOTAL)) {
    throw new BadRequestException({
      success: false,
      message: `The quote total may not exceed ${MAX_AMOUNT}`,
      code: 'QUOTE_TOTAL_TOO_LARGE',
    });
  }
}

/** What open quote cards need to stay current (sent as the `quote:updated` socket event). */
function quoteUpdate(quote: Pick<Quote, 'id' | 'status' | 'totalPrice' | 'currency' | 'etaBusinessDays' | 'validUntil'>) {
  return {
    quoteId: quote.id,
    status: quote.status,
    totalPrice: quote.totalPrice.toString(),
    currency: quote.currency,
    etaBusinessDays: quote.etaBusinessDays,
    validUntil: quote.validUntil,
  };
}

/** Thrown inside the accept transaction to roll it back with a client-facing conflict. */
function isExpired(expiresAt: Date | null | undefined): boolean {
  return !!expiresAt && expiresAt.getTime() <= Date.now();
}

function designExpired(): ConflictException {
  return new ConflictException({ success: false, message: 'This listing has expired', code: 'DESIGN_EXPIRED' });
}

class AcceptConflict extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

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

  /** The jeweler as the designer knows them: the business name, else their own name. */
  private jewelerName(
    user: { firstName: string | null; lastName: string | null; jewelerProfile?: { businessName: string } | null } | null | undefined,
  ): string {
    const business = user?.jewelerProfile?.businessName?.trim();
    if (business) {
      return business;
    }
    const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
    return name.length > 0 ? name : 'הצורף';
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
    if (!conversation.participants.some((p) => p.userId === userId && !p.leftAt)) {
      throw new ForbiddenException({ success: false, message: 'Not a participant of this conversation' });
    }
    return conversation;
  }

  private cardPayload(quote: { id: string; totalPrice: Prisma.Decimal; currency: string; etaBusinessDays: number }) {
    return toJsonValue({
      quoteId: quote.id,
      totalPrice: quote.totalPrice.toString(),
      currency: quote.currency,
      etaBusinessDays: quote.etaBusinessDays,
    });
  }

  /**
   * Only a jeweler who is not the design owner may quote, in a conversation that includes the
   * owner, on a PUBLISHED design. A linked design request must belong to the same design and
   * have been delivered to this jeweler; its status moves through the state machine.
   */
  async create(user: User, dto: CreateQuoteDto) {
    const conversation = await this.assertConversationParticipant(dto.conversationId, user.id);
    if (conversation.designId !== dto.designId) {
      throw new BadRequestException({
        success: false,
        message: 'designId does not match the conversation design',
      });
    }

    const design = await this.prisma.design.findFirst({ where: { id: dto.designId, deletedAt: null } });
    if (!design) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }
    if (design.ownerUserId === user.id) {
      throw new ForbiddenException({ success: false, message: 'You cannot quote your own design' });
    }
    if (!user.roles.includes(UserRole.JEWELER)) {
      throw new ForbiddenException({ success: false, message: 'Only jewelers can submit quotes' });
    }
    if (!conversation.participants.some((p) => p.userId === design.ownerUserId && !p.leftAt)) {
      throw new ForbiddenException({
        success: false,
        message: 'The design owner is not part of this conversation',
      });
    }
    if (design.status !== DesignStatus.PUBLISHED) {
      throw new ConflictException({
        success: false,
        message: 'This design is not open for quotes',
        code: 'DESIGN_NOT_PUBLISHED',
      });
    }
    if (isExpired(design.expiresAt)) {
      throw designExpired();
    }

    if (dto.designRequestId) {
      const request = await this.prisma.designRequest.findUnique({
        where: { id: dto.designRequestId },
        include: { targets: { include: { jewelerProfile: { select: { userId: true } } } } },
      });
      if (!request) {
        throw new NotFoundException({ success: false, message: 'Design request not found' });
      }
      if (request.designId !== dto.designId) {
        throw new BadRequestException({
          success: false,
          message: 'designRequestId does not belong to this design',
        });
      }
      if (!request.targets.some((t) => t.jewelerProfile.userId === user.id)) {
        throw new ForbiddenException({ success: false, message: 'This request was not sent to you' });
      }
      this.stateMachine.assertTransition(
        this.stateMachine.designRequestGraph,
        request.status,
        DesignRequestStatus.QUOTE_SUBMITTED,
      );
    }

    const materialsCost = new Prisma.Decimal(dto.materialsCost);
    const laborCost = new Prisma.Decimal(dto.laborCost);
    const totalPrice = materialsCost.add(laborCost);
    assertStorableTotal(totalPrice);

    const disclaimer = await this.prisma.contentPage.findFirst({
      where: { slug: 'quote_disclaimer', locale: 'he', status: ContentPageStatus.PUBLISHED },
      orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
    });

    const { quote, message } = await this.prisma.$transaction(async (tx) => {
      // The author's account in share mode: a deletion of it (which withdraws the author's open
      // quotes under the account lock) either finished first and is seen here, or waits for this
      // quote and then withdraws it too. A quote never stays open for an account that is gone.
      await shareLockUser(tx, user.id);
      const author = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { deletedAt: true } });
      if (author.deletedAt) {
        throw new UnauthorizedException({ success: false, message: 'Session ended', code: AUTH_ERROR.TOKEN_INVALID });
      }
      // Shared lock: an accept on this design (FOR UPDATE) cannot interleave, so a quote is never
      // added to a design that was completed after the checks above.
      const [current] = await tx.$queryRaw<
        Array<{ status: string; deletedAt: Date | null; expiresAt: Date | null; parameters: unknown }>
      >`
        SELECT "status", "deletedAt", "expiresAt", "parameters" FROM "designs" WHERE "id" = ${dto.designId}::uuid FOR SHARE`;
      if (!current || current.deletedAt || current.status !== DesignStatus.PUBLISHED) {
        throw new ConflictException({
          success: false,
          message: 'This design is not open for quotes',
          code: 'DESIGN_NOT_PUBLISHED',
        });
      }
      if (isExpired(current.expiresAt)) {
        throw designExpired();
      }

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
          // The design as it is now is what this price is for (an accept checks it is unchanged).
          designHash: designFingerprint(current.parameters),
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
          payload: this.cardPayload(createdQuote),
        },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, avatarUploadId: true } },
          quote: { include: { design: { select: QUOTE_DESIGN_SELECT } } },
        },
      });

      await tx.conversation.update({
        where: { id: dto.conversationId },
        data: { lastMessageAt: createdMessage.createdAt },
      });

      if (dto.designRequestId) {
        // Conditional: a request cancelled meanwhile is not resurrected.
        const moved = await tx.designRequest.updateMany({
          where: {
            id: dto.designRequestId,
            status: {
              in: [DesignRequestStatus.OPEN, DesignRequestStatus.NEGOTIATING, DesignRequestStatus.QUOTE_SUBMITTED],
            },
          },
          data: { status: DesignRequestStatus.QUOTE_SUBMITTED },
        });
        if (moved.count !== 1) {
          throw new ConflictException({
            success: false,
            message: 'The design request is no longer open',
            code: 'REQUEST_NOT_OPEN',
          });
        }
      }
      // This jeweler's own order(s) for the design: a quote is now submitted (also after an earlier
      // quote was declined, or the request was declined and then quoted anyway).
      await moveOrders(
        tx,
        { designId: dto.designId, jewelerUserIds: [user.id], openRequestsOnly: true },
        [RequestTargetStatus.NEW, RequestTargetStatus.NEGOTIATING, RequestTargetStatus.CLOSED, RequestTargetStatus.DECLINED],
        RequestTargetStatus.QUOTE_SUBMITTED,
      );

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

    await this.notifications.createInApp(
      design.ownerUserId,
      'quote.created',
      'New quote received',
      `You received a new quote of ${totalPrice.toString()} ${quote.currency}`,
      { quoteId: quote.id, conversationId: quote.conversationId },
    );

    return this.findOne(quote.id, user);
  }

  async findOne(id: string, user: User) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: {
        disclaimerPage: true,
        author: { select: QUOTE_AUTHOR_SELECT },
        design: { select: { ...QUOTE_DESIGN_SELECT, ownerUserId: true } },
        conversation: { include: { participants: true } },
      },
    });
    if (!quote) {
      throw new NotFoundException({ success: false, message: 'Quote not found' });
    }
    // The design owner and the author always see the quote (it is their deal); anyone else only
    // while they are still in the conversation.
    const {
      conversation,
      author,
      design: { ownerUserId, ...design },
      ...rest
    } = quote;
    const allowed =
      user.roles.includes(UserRole.ADMIN) ||
      quote.authorUserId === user.id ||
      ownerUserId === user.id ||
      conversation.participants.some((p) => p.userId === user.id && !p.leftAt);
    if (!allowed) {
      throw new ForbiddenException({ success: false, message: 'Not authorized to view this quote' });
    }
    return { ...rest, author: withBusinessName(author), design };
  }

  /** Every quote a design received, newest first, for its owner to compare (PRD 5.6). */
  async listForDesign(designId: string, user: User) {
    const design = await this.prisma.design.findUnique({
      where: { id: designId },
      select: { ownerUserId: true, deletedAt: true },
    });
    if (!design || design.deletedAt) {
      throw new NotFoundException({ success: false, message: 'Design not found' });
    }
    if (design.ownerUserId !== user.id && !user.roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException({ success: false, message: 'Only the design owner can list its quotes' });
    }
    const now = new Date();
    const quotes = await this.prisma.quote.findMany({
      where: { designId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        conversationId: true,
        designRequestId: true,
        status: true,
        materialsCost: true,
        laborCost: true,
        totalPrice: true,
        currency: true,
        etaBusinessDays: true,
        notes: true,
        validUntil: true,
        acceptedAt: true,
        declinedAt: true,
        createdAt: true,
        author: { select: QUOTE_AUTHOR_SELECT },
      },
    });
    return quotes.map(({ author, ...quote }) => ({
      ...quote,
      // Past its validity it can no longer be accepted, even before the sweep marks it.
      status: this.isExpired(quote, now) ? QuoteStatus.EXPIRED : quote.status,
      author: withBusinessName(author),
    }));
  }

  private isExpired(quote: Pick<Quote, 'status' | 'validUntil'>, now: Date): boolean {
    return quote.status === QuoteStatus.PENDING && quote.validUntil !== null && quote.validUntil.getTime() < now.getTime();
  }

  /**
   * Pending quotes past their validity become EXPIRED (PRD 5.6). The jeweler's order returns to
   * New while its request still takes quotes, and the conversation's open card is updated.
   */
  async expireStale(now = new Date()): Promise<number> {
    const stale = await this.prisma.quote.findMany({
      where: { status: QuoteStatus.PENDING, validUntil: { lt: now } },
      select: { id: true, conversationId: true, designId: true, authorUserId: true },
      orderBy: { validUntil: 'asc' },
      take: EXPIRY_BATCH,
    });
    let expired = 0;
    for (const quote of stale) {
      // Conditional: a quote accepted, withdrawn or extended meanwhile is left as it is.
      const changed = await this.prisma.$transaction(async (tx) => {
        const moved = await tx.quote.updateMany({
          where: { id: quote.id, status: QuoteStatus.PENDING, validUntil: { lt: now } },
          data: { status: QuoteStatus.EXPIRED },
        });
        if (moved.count !== 1) {
          return false;
        }
        await tx.quoteEvent.create({
          data: {
            quoteId: quote.id,
            fromStatus: QuoteStatus.PENDING,
            toStatus: QuoteStatus.EXPIRED,
            actorUserId: null,
            note: 'Expired: past its validity',
          },
        });
        await moveOrders(
          tx,
          { designId: quote.designId, jewelerUserIds: [quote.authorUserId], openRequestsOnly: true },
          [RequestTargetStatus.QUOTE_SUBMITTED, RequestTargetStatus.NEGOTIATING],
          RequestTargetStatus.NEW,
        );
        return true;
      });
      if (changed) {
        expired += 1;
        this.gateway.emitToConversation(quote.conversationId, 'quote:updated', {
          quoteId: quote.id,
          status: QuoteStatus.EXPIRED,
        });
      }
    }
    return expired;
  }

  private async loadForDecision(id: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: { design: { select: { ownerUserId: true } } },
    });
    if (!quote) {
      throw new NotFoundException({ success: false, message: 'Quote not found' });
    }
    return quote;
  }

  /**
   * Refuses a quote that cannot be accepted on the terms the owner confirmed. Used as a fast check
   * before the transaction and, inside it, to explain why the atomic claim did not match.
   */
  private assertAcceptable(
    quote: Pick<Quote, 'status' | 'validUntil' | 'totalPrice' | 'currency'>,
    expectedTotal: Prisma.Decimal,
    expectedCurrency: string,
    now: Date,
  ): void {
    if (quote.status !== QuoteStatus.PENDING) {
      throw new ConflictException({
        success: false,
        message: `This quote is ${quote.status.toLowerCase()}`,
        code: 'QUOTE_NOT_PENDING',
      });
    }
    if (quote.validUntil && quote.validUntil.getTime() < now.getTime()) {
      throw new ConflictException({ success: false, message: 'This quote has expired', code: 'QUOTE_EXPIRED' });
    }
    if (!expectedTotal.equals(quote.totalPrice) || expectedCurrency !== quote.currency.toUpperCase()) {
      throw new ConflictException({
        success: false,
        message: 'The quote changed since you opened it; review the new terms',
        code: 'QUOTE_CHANGED',
        currentTotalPrice: quote.totalPrice.toString(),
        currentCurrency: quote.currency,
      });
    }
  }

  /**
   * Accepting a quote is the design owner's decision alone, on the exact terms they saw. The
   * design row is locked first, so concurrent accepts (same or competing quotes) serialize:
   * exactly one quote is ACCEPTED and the design is COMPLETED once. The quote is claimed with a
   * compare-and-set on status, price, currency and validity, so an edit that lands meanwhile is
   * refused (409 QUOTE_CHANGED) instead of being accepted unseen. Competing pending quotes are
   * locked before they are declined, and the notifications are queued in the same transaction.
   * Repeating an accept is idempotent.
   */
  async accept(id: string, user: User, dto: AcceptQuoteDto) {
    const existing = await this.loadForDecision(id);
    if (existing.design.ownerUserId !== user.id) {
      throw new ForbiddenException({ success: false, message: 'Only the design owner can accept a quote' });
    }
    if (existing.status === QuoteStatus.ACCEPTED) {
      return this.findOne(id, user);
    }
    const expectedTotal = new Prisma.Decimal(dto.expectedTotalPrice);
    const expectedCurrency = dto.expectedCurrency.toUpperCase();
    this.assertAcceptable(existing, expectedTotal, expectedCurrency, new Date());

    const acceptedAt = new Date();
    let result: {
      accepted: Quote;
      acceptedMsg: Prisma.MessageGetPayload<object>;
      handoffMsg: Prisma.MessageGetPayload<object>;
      declined: Array<{ id: string; authorUserId: string; conversationId: string }>;
    };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "designs" WHERE id = ${existing.designId}::uuid FOR UPDATE`;
        const design = await tx.design.findUniqueOrThrow({ where: { id: existing.designId } });
        if (design.acceptedQuoteId === id) {
          throw new AcceptConflict('ALREADY_ACCEPTED', 'Already accepted');
        }
        if (design.status !== DesignStatus.PUBLISHED || design.acceptedQuoteId || design.deletedAt) {
          throw new AcceptConflict('DESIGN_NOT_OPEN', 'This design already has an accepted quote');
        }

        // Every open quote of the design is locked in id order before any of them changes, the
        // order account deletion locks a jeweler's open quotes in: with two open quotes of one
        // jeweler here, the two never wait on each other in a cycle.
        const open = await tx.$queryRaw<Array<{ id: string; authorUserId: string; conversationId: string }>>`
          SELECT "id", "authorUserId", "conversationId" FROM "quotes"
           WHERE "designId" = ${existing.designId}::uuid AND "status" = 'PENDING'
           ORDER BY "id"
           FOR UPDATE`;
        // A quote whose author closed the account is not a live offer (its contact details are gone).
        const author = await tx.user.findUnique({ where: { id: existing.authorUserId }, select: { deletedAt: true } });
        if (!author || author.deletedAt) {
          throw new AcceptConflict('QUOTE_NOT_PENDING', 'The jeweler who made this quote has closed their account');
        }
        // The price is for the design as it was quoted: an edit since then (e.g. another metal) needs
        // the jeweler to update the quote first. Quotes from before fingerprints carry none.
        const priced = await tx.quote.findUniqueOrThrow({ where: { id }, select: { designHash: true } });
        if (priced.designHash && priced.designHash !== designFingerprint(design.parameters)) {
          throw new AcceptConflict(
            'DESIGN_CHANGED_SINCE_QUOTE',
            'The design changed after this quote was made; ask the jeweler to update the quote',
          );
        }

        const claimed = await tx.quote.updateMany({
          where: {
            id,
            status: QuoteStatus.PENDING,
            totalPrice: expectedTotal,
            currency: { equals: expectedCurrency, mode: 'insensitive' },
            OR: [{ validUntil: null }, { validUntil: { gte: acceptedAt } }],
          },
          data: { status: QuoteStatus.ACCEPTED, acceptedAt },
        });
        if (claimed.count !== 1) {
          const current = await tx.quote.findUniqueOrThrow({ where: { id } });
          this.assertAcceptable(current, expectedTotal, expectedCurrency, acceptedAt);
          throw new AcceptConflict('QUOTE_NOT_PENDING', 'This quote is no longer pending');
        }
        const accepted = await tx.quote.findUniqueOrThrow({ where: { id } });
        await tx.quoteEvent.create({
          data: { quoteId: id, fromStatus: QuoteStatus.PENDING, toStatus: QuoteStatus.ACCEPTED, actorUserId: user.id },
        });

        await tx.design.update({
          where: { id: existing.designId },
          data: {
            status: DesignStatus.COMPLETED,
            completedAt: acceptedAt,
            completedByJewelerId: existing.authorUserId,
            acceptedQuoteId: existing.id,
            // Editors holding the pre-acceptance version are refused as stale.
            version: { increment: 1 },
          },
        });

        // Every jeweler's order for this design: the winner's completes, the others' close.
        await moveOrders(
          tx,
          { designId: existing.designId, jewelerUserIds: [existing.authorUserId] },
          [RequestTargetStatus.NEW, RequestTargetStatus.QUOTE_SUBMITTED, RequestTargetStatus.NEGOTIATING, RequestTargetStatus.CLOSED],
          RequestTargetStatus.COMPLETED,
        );
        await moveOrders(
          tx,
          { designId: existing.designId, exceptJewelerUserId: existing.authorUserId },
          [RequestTargetStatus.NEW, RequestTargetStatus.QUOTE_SUBMITTED, RequestTargetStatus.NEGOTIATING],
          RequestTargetStatus.CLOSED,
        );
        await tx.designRequest.updateMany({
          where: {
            designId: existing.designId,
            status: { in: [DesignRequestStatus.OPEN, DesignRequestStatus.QUOTE_SUBMITTED, DesignRequestStatus.NEGOTIATING] },
          },
          data: { status: DesignRequestStatus.COMPLETED },
        });

        // Locked above, before the claim: a concurrent withdraw or edit either committed first (and is
        // respected) or waits for this decision.
        const declined = open.filter((other) => other.id !== id);
        if (declined.length > 0) {
          await tx.quote.updateMany({
            where: { id: { in: declined.map((q) => q.id) } },
            data: { status: QuoteStatus.DECLINED, declinedAt: acceptedAt },
          });
          await tx.quoteEvent.createMany({
            data: declined.map((other) => ({
              quoteId: other.id,
              fromStatus: QuoteStatus.PENDING,
              toStatus: QuoteStatus.DECLINED,
              actorUserId: user.id,
              note: 'Auto-declined: another quote was accepted for this design',
            })),
          });
          // Queued with the decision: a crash right after the commit cannot lose these.
          for (const other of declined) {
            await this.outbox.enqueue(
              'notification.push',
              {
                userId: other.authorUserId,
                eventKey: 'quote.declined',
                title: 'Quote declined',
                body: 'Another quote was accepted for this design; your quote was automatically declined.',
                quoteId: other.id,
              },
              tx,
            );
          }
        }

        const jeweler = await tx.user.findUnique({
          where: { id: existing.authorUserId },
          include: { jewelerProfile: true },
        });
        const phone = jeweler?.jewelerProfile?.phone || jeweler?.phone || null;
        const whatsappUrl = this.toWhatsappUrl(phone);
        const jewelerName = this.jewelerName(jeweler);

        const [acceptedTemplate, handoffTemplate] = await Promise.all([
          tx.systemMessageTemplate.findUnique({ where: { eventKey_locale: { eventKey: 'quote.accepted', locale: 'he' } } }),
          tx.systemMessageTemplate.findUnique({ where: { eventKey_locale: { eventKey: 'handoff.created', locale: 'he' } } }),
        ]);

        const templateVars = { jewelerName, whatsappUrl: whatsappUrl ?? '' };
        const acceptedMsg = await tx.message.create({
          data: {
            conversationId: existing.conversationId,
            senderId: null,
            type: MessageType.SYSTEM,
            body: this.renderTemplate(acceptedTemplate?.body ?? ACCEPTED_MESSAGE, templateVars),
            payload: toJsonValue({ eventKey: 'quote.accepted', quoteId: id }),
          },
        });
        const handoffMsg = await tx.message.create({
          data: {
            conversationId: existing.conversationId,
            senderId: null,
            type: MessageType.SYSTEM,
            body: this.renderTemplate(
              whatsappUrl ? (handoffTemplate?.body ?? HANDOFF_MESSAGE) : HANDOFF_WITHOUT_LINK_MESSAGE,
              templateVars,
            ),
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
              declinedQuoteIds: declined.map((q) => q.id),
            }),
          },
        });
        // The contact handoff is on the record (PRD 5.6); the phone number itself stays in the message.
        await tx.eventLog.create({
          data: {
            eventKey: 'handoff.created',
            entityType: 'Quote',
            entityId: id,
            payload: toJsonValue({
              conversationId: existing.conversationId,
              messageId: handoffMsg.id,
              channel: whatsappUrl ? 'whatsapp' : 'chat',
            }),
          },
        });
        const handoff = { quoteId: id, designId: existing.designId, jewelerUserId: existing.authorUserId };
        await this.outbox.enqueue('quote.accepted', handoff, tx);
        await this.outbox.enqueue('handoff.created', handoff, tx);

        return { accepted, acceptedMsg, handoffMsg, declined };
      }, DECISION_TX);
    } catch (err) {
      if (err instanceof AcceptConflict) {
        if (err.code === 'ALREADY_ACCEPTED') {
          return this.findOne(id, user);
        }
        throw new ConflictException({ success: false, message: err.message, code: err.code });
      }
      throw err;
    }

    this.gateway.emitToConversation(existing.conversationId, 'message:new', result.acceptedMsg);
    this.gateway.emitToConversation(existing.conversationId, 'message:new', result.handoffMsg);
    this.gateway.emitToConversation(existing.conversationId, 'quote:updated', quoteUpdate(result.accepted));
    for (const other of result.declined) {
      this.gateway.emitToConversation(other.conversationId, 'quote:updated', {
        quoteId: other.id,
        status: QuoteStatus.DECLINED,
      });
    }

    await this.notifications.createInApp(
      user.id,
      'quote.accepted',
      'Quote accepted',
      'The quote was accepted. Check the conversation for handoff details.',
      { quoteId: id },
    );

    return this.findOne(id, user);
  }

  /** Declining is the design owner's decision; repeating it is idempotent. */
  async decline(id: string, user: User, dto: DeclineQuoteDto) {
    const quote = await this.loadForDecision(id);
    if (quote.design.ownerUserId !== user.id) {
      throw new ForbiddenException({ success: false, message: 'Only the design owner can decline a quote' });
    }
    if (quote.status === QuoteStatus.DECLINED) {
      return this.findOne(id, user);
    }
    const declinedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.quote.updateMany({
        where: { id, status: QuoteStatus.PENDING },
        data: { status: QuoteStatus.DECLINED, declinedAt },
      });
      if (changed.count !== 1) {
        throw new ConflictException({ success: false, message: 'This quote is no longer pending', code: 'QUOTE_NOT_PENDING' });
      }
      await tx.quoteEvent.create({
        data: {
          quoteId: id,
          fromStatus: QuoteStatus.PENDING,
          toStatus: QuoteStatus.DECLINED,
          actorUserId: user.id,
          note: dto.note ?? null,
        },
      });
      // The jeweler's order for the design closes (a new quote reopens it).
      await moveOrders(
        tx,
        { designId: quote.designId, jewelerUserIds: [quote.authorUserId] },
        [RequestTargetStatus.QUOTE_SUBMITTED, RequestTargetStatus.NEGOTIATING],
        RequestTargetStatus.CLOSED,
      );
    });

    this.gateway.emitToConversation(quote.conversationId, 'quote:updated', { quoteId: id, status: QuoteStatus.DECLINED });
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

  /** The author can take back a quote that was not decided yet. */
  async withdraw(id: string, user: User) {
    const quote = await this.loadForDecision(id);
    if (quote.authorUserId !== user.id) {
      throw new ForbiddenException({ success: false, message: 'Only the quote author can withdraw it' });
    }
    if (quote.status === QuoteStatus.WITHDRAWN) {
      return this.findOne(id, user);
    }
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.quote.updateMany({
        where: { id, status: QuoteStatus.PENDING },
        data: { status: QuoteStatus.WITHDRAWN },
      });
      if (changed.count !== 1) {
        throw new ConflictException({ success: false, message: 'This quote is no longer pending', code: 'QUOTE_NOT_PENDING' });
      }
      await tx.quoteEvent.create({
        data: { quoteId: id, fromStatus: QuoteStatus.PENDING, toStatus: QuoteStatus.WITHDRAWN, actorUserId: user.id },
      });
      // The order returns to New while its request still takes quotes.
      await moveOrders(
        tx,
        { designId: quote.designId, jewelerUserIds: [user.id], openRequestsOnly: true },
        [RequestTargetStatus.QUOTE_SUBMITTED, RequestTargetStatus.NEGOTIATING],
        RequestTargetStatus.NEW,
      );
    });
    this.gateway.emitToConversation(quote.conversationId, 'quote:updated', { quoteId: id, status: QuoteStatus.WITHDRAWN });
    await this.eventLog.record('quote.withdrawn', 'Quote', id, { actorUserId: user.id });
    return this.findOne(id, user);
  }

  async update(id: string, user: User, dto: UpdateQuoteDto) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: { design: { select: { ownerUserId: true } } },
    });
    if (!quote) {
      throw new NotFoundException({ success: false, message: 'Quote not found' });
    }
    if (quote.authorUserId !== user.id) {
      throw new ForbiddenException({ success: false, message: 'Only the quote author can edit it' });
    }
    if (quote.status !== QuoteStatus.PENDING) {
      throw new ConflictException({ success: false, message: 'Only pending quotes can be edited', code: 'QUOTE_NOT_PENDING' });
    }

    const materialsCost = dto.materialsCost != null ? new Prisma.Decimal(dto.materialsCost) : quote.materialsCost;
    const laborCost = dto.laborCost != null ? new Prisma.Decimal(dto.laborCost) : quote.laborCost;
    const totalPrice = materialsCost.add(laborCost);
    assertStorableTotal(totalPrice);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Editing the offer prices the design as it is now (it may have changed since the quote).
      const priced = await tx.design.findUniqueOrThrow({ where: { id: quote.designId }, select: { parameters: true } });
      const changed = await tx.quote.updateMany({
        where: { id, status: QuoteStatus.PENDING },
        data: {
          designHash: designFingerprint(priced.parameters),
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
      if (changed.count !== 1) {
        throw new ConflictException({ success: false, message: 'This quote is no longer pending', code: 'QUOTE_NOT_PENDING' });
      }
      const fresh = await tx.quote.findUniqueOrThrow({ where: { id } });
      // Keep the chat card in sync so the owner never sees a stale price.
      await tx.message.updateMany({
        where: { quoteId: id, type: MessageType.QUOTE_CARD },
        data: { payload: this.cardPayload(fresh) },
      });
      return fresh;
    });

    this.gateway.emitToConversation(updated.conversationId, 'quote:updated', quoteUpdate(updated));
    await this.eventLog.record('quote.updated', 'Quote', id, { actorUserId: user.id });
    await this.notifications.createInApp(
      quote.design.ownerUserId,
      'quote.updated',
      'Quote updated',
      `A quote was updated to ${updated.totalPrice.toString()} ${updated.currency}`,
      { quoteId: id, conversationId: updated.conversationId },
    );

    return this.findOne(updated.id, user);
  }
}
