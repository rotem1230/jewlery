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
import { AUTH_ERROR } from '../auth/constants';
import { SafeUser } from '../auth/interfaces/auth-user.interface';
import { PasswordService } from '../auth/services/password.service';
import { TokenService } from '../auth/services/token.service';
import { SessionEvents } from '../common/session-events/session-events.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PrismaService } from '../database/prisma.service';
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

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({
        success: false,
        message: 'Password change is not available for this account',
        code: AUTH_ERROR.INVALID_CREDENTIALS,
      });
    }

    const ok = await this.password.compare(dto.currentPassword, user.passwordHash);
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
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Changing the password invalidates every other session as a security precaution.
    await this.tokens.revokeAllForUser(userId);

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
   * jeweler listing is unpublished, the user's designs leave the marketplace, open requests are
   * cancelled, and every session and push device is revoked.
   */
  async softDelete(userId: string): Promise<{ ok: true }> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
      // Before the address is erased: a new account for it must not get the same trials again.
      await this.subscriptions.recordTrialsBeforeDeletion(tx, userId, current.email);
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
      const openQuotes = await tx.quote.findMany({
        where: { authorUserId: userId, status: QuoteStatus.PENDING },
        select: { id: true },
      });
      if (openQuotes.length > 0) {
        await tx.quote.updateMany({
          where: { id: { in: openQuotes.map((q) => q.id) }, status: QuoteStatus.PENDING },
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
      }
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
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    });
    this.sessionEvents.sessionsRevoked(userId);

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
