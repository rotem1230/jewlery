import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import {
  DesignRequestStatus,
  DeviceToken,
  Prisma,
  ProfilePublishStatus,
  QuoteStatus,
  User,
  UserPreference,
  UserStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AUTH_ERROR } from '../auth/constants';
import { ChatGateway } from '../chat/chat.gateway';
import { OutboxService } from '../common/outbox/outbox.service';
import { SafeUser } from '../auth/interfaces/auth-user.interface';
import { PasswordService } from '../auth/services/password.service';
import { TokenService } from '../auth/services/token.service';
import { SessionEvents } from '../common/session-events/session-events.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PrismaService } from '../database/prisma.service';
import { lockUser } from '../database/row-locks';
import { UploadsService } from '../uploads/uploads.service';
import { ChangePasswordDto, RegisterDeviceDto, UpdateMeDto, UpdatePreferencesDto } from './dto/users.dto';

/** What any signed-in user may see about another user (no e-mail, phone or account state). */
export const PUBLIC_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUploadId: true,
  roles: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly sessionEvents: SessionEvents,
    private readonly subscriptions: SubscriptionsService,
    private readonly auth: AuthService,
    private readonly gateway: ChatGateway,
    private readonly outbox: OutboxService,
  ) {}

  private sanitize(user: User): SafeUser {
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async findPublic(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException({ success: false, message: 'User not found' });
    }
    return user;
  }

  async updateProfile(userId: string, dto: UpdateMeDto): Promise<SafeUser> {
    if (dto.avatarUploadId) {
      await this.uploads.assertOwnedImage(dto.avatarUploadId, userId, 'avatarUploadId');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.avatarUploadId !== undefined ? { avatarUploadId: dto.avatarUploadId } : {}),
      },
    });

    return this.sanitize(updated);
  }

  /** `requester`: the signed-in account as its access token was checked (its session version). */
  async changePassword(requester: Pick<User, 'id' | 'sessionVersion'>, dto: ChangePasswordDto): Promise<{ ok: true }> {
    const userId = requester.id;
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({
        success: false,
        message: 'Password change is not available for this account',
        code: AUTH_ERROR.INVALID_CREDENTIALS,
      });
    }

    // Counted like a sign-in attempt: a stolen session cannot be used to guess the password.
    const ok = await this.auth.verifyCurrentPassword(user.id, user.passwordHash, dto.currentPassword);
    if (!ok) {
      throw new UnauthorizedException({
        success: false,
        message: 'Current password is incorrect',
        code: AUTH_ERROR.INVALID_CURRENT_PASSWORD,
      });
    }

    const strengthError = await this.password.validateStrength(dto.newPassword);
    if (strengthError) {
      throw new BadRequestException({
        success: false,
        message: strengthError,
        code: AUTH_ERROR.WEAK_PASSWORD,
      });
    }

    const passwordHash = await this.password.hash(dto.newPassword);
    // Every session ends with the old password, this one included: the app signs in again with
    // the new password, other devices are signed out at once. Under the account lock the password
    // checked above must still be the account's and this session still current: a reset (or any
    // other end of all sessions) that committed meanwhile is never overwritten by this request.
    const changed = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const current = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { passwordHash: true, sessionVersion: true, deletedAt: true },
      });
      if (
        current.deletedAt ||
        current.passwordHash !== user.passwordHash ||
        current.sessionVersion !== requester.sessionVersion
      ) {
        return false;
      }
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await this.tokens.endAllSessions(tx, userId);
      return true;
    });
    if (!changed) {
      throw new UnauthorizedException({
        success: false,
        message: 'Session ended',
        code: AUTH_ERROR.TOKEN_INVALID,
      });
    }
    this.tokens.announceSessionsEnded(userId);

    await this.audit.log({
      actorUserId: userId,
      action: 'user.password_changed',
      entityType: 'User',
      entityId: userId,
    });

    return { ok: true };
  }

  async upsertPreferences(userId: string, dto: UpdatePreferencesDto): Promise<UserPreference> {
    return this.prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: { ...dto },
    });
  }

  /**
   * Deletes the account: personal data is anonymized (the e-mail is freed for a new account), the
   * jeweler listing is unpublished, open quotes are withdrawn (their designers are told), the
   * user's designs leave the marketplace, open requests are cancelled, billing ends, and every
   * session and push device is revoked.
   */
  async softDelete(userId: string): Promise<{ ok: true }> {
    const now = new Date();
    const withdrawn = await this.prisma.$transaction(async (tx) => {
      // Serialized with payments and checkouts for this account (they take the same lock); its
      // sessions end first, so nothing signed in keeps acting while the account is taken apart.
      await lockUser(tx, userId);
      await this.tokens.endAllSessions(tx, userId);
      // Open quotes are locked and withdrawn before the account row's identifying columns change
      // (that takes a stronger lock): an owner accepting one of them right now either finishes
      // first (and the quote stays accepted) or finds it withdrawn — the two never wait on each
      // other in a cycle.
      const openQuotes = await tx.$queryRaw<Array<{ id: string; conversationId: string; ownerUserId: string }>>`
        SELECT q."id", q."conversationId", d."ownerUserId"
          FROM "quotes" q JOIN "designs" d ON d."id" = q."designId"
         WHERE q."authorUserId" = ${userId}::uuid AND q."status" = 'PENDING'
         ORDER BY q."id"
           FOR UPDATE OF q`;
      if (openQuotes.length > 0) {
        await tx.quote.updateMany({
          where: { id: { in: openQuotes.map((q) => q.id) } },
          data: { status: QuoteStatus.WITHDRAWN },
        });
        await tx.quoteEvent.createMany({
          data: openQuotes.map((q) => ({
            quoteId: q.id,
            fromStatus: QuoteStatus.PENDING,
            toStatus: QuoteStatus.WITHDRAWN,
            actorUserId: userId,
            note: 'Withdrawn: the jeweler deleted their account',
          })),
        });
        for (const quote of openQuotes) {
          await this.outbox.enqueue(
            'notification.push',
            {
              userId: quote.ownerUserId,
              eventKey: 'quote.withdrawn',
              title: 'Quote withdrawn',
              body: 'A jeweler closed their account; their quote on your design was withdrawn.',
              quoteId: quote.id,
            },
            tx,
          );
        }
      }
      const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
      // Before the address is erased: a new account for it must not get the same trials again.
      await this.subscriptions.recordTrialsBeforeDeletion(tx, userId, current.email);
      await this.subscriptions.endForDeletedAccount(tx, userId);
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          status: UserStatus.DEACTIVATED,
          email: `deleted+${userId}@deleted.invalid`,
          firstName: null,
          lastName: null,
          phone: null,
          avatarUploadId: null,
          passwordHash: null,
          authProviderSub: null,
          emailVerifiedAt: null,
          loginAttempts: 0,
          lockedUntil: null,
        },
      });
      // The listing goes offline and its contact details are erased (they would otherwise still
      // reach customers through the post-acceptance handoff).
      await tx.jewelerProfile.updateMany({
        where: { userId },
        data: {
          publishStatus: ProfilePublishStatus.UNPUBLISHED,
          businessName: 'Deleted jeweler',
          phone: '',
          email: null,
          bio: null,
          serviceAreaText: null,
          businessHours: Prisma.DbNull,
          latitude: null,
          longitude: null,
          logoUploadId: null,
        },
      });
      await tx.jewelerOnboardingDraft.deleteMany({ where: { userId } });
      await tx.design.updateMany({ where: { ownerUserId: userId, deletedAt: null }, data: { deletedAt: now } });
      await tx.designRequest.updateMany({
        where: {
          requesterId: userId,
          status: {
            in: [DesignRequestStatus.OPEN, DesignRequestStatus.QUOTE_SUBMITTED, DesignRequestStatus.NEGOTIATING],
          },
        },
        data: { status: DesignRequestStatus.CANCELLED },
      });
      await tx.deviceToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      return openQuotes;
    });
    this.sessionEvents.sessionsRevoked(userId);
    for (const quote of withdrawn) {
      this.gateway.emitToConversation(quote.conversationId, 'quote:updated', {
        quoteId: quote.id,
        status: QuoteStatus.WITHDRAWN,
      });
    }

    await this.audit.log({
      actorUserId: userId,
      action: 'user.self_deleted',
      entityType: 'User',
      entityId: userId,
    });

    return { ok: true };
  }

  async registerDevice(userId: string, dto: RegisterDeviceDto): Promise<DeviceToken> {
    return this.prisma.deviceToken.upsert({
      where: { userId_token: { userId, token: dto.token } },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
        appVersion: dto.appVersion,
      },
      update: {
        platform: dto.platform,
        appVersion: dto.appVersion,
        lastSeenAt: new Date(),
        revokedAt: null,
      },
    });
  }

  async removeDevice(userId: string, deviceId: string): Promise<{ ok: true }> {
    const device = await this.prisma.deviceToken.findFirst({ where: { id: deviceId, userId } });
    if (!device) {
      throw new NotFoundException({ success: false, message: 'Device not found' });
    }

    await this.prisma.deviceToken.update({
      where: { id: deviceId },
      data: { revokedAt: new Date() },
    });

    return { ok: true };
  }
}
