import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DeviceToken, User, UserPreference, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AUTH_ERROR } from '../auth/constants';
import { SafeUser } from '../auth/interfaces/auth-user.interface';
import { PasswordService } from '../auth/services/password.service';
import { TokenService } from '../auth/services/token.service';
import { PrismaService } from '../database/prisma.service';
import { ChangePasswordDto, RegisterDeviceDto, UpdateMeDto, UpdatePreferencesDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  private sanitize(user: User): SafeUser {
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async updateProfile(userId: string, dto: UpdateMeDto): Promise<SafeUser> {
    if (dto.avatarUploadId) {
      const upload = await this.prisma.upload.findFirst({
        where: { id: dto.avatarUploadId, ownerUserId: userId, deletedAt: null },
      });
      if (!upload) {
        throw new BadRequestException({
          success: false,
          message: 'avatarUploadId must reference an upload owned by the current user',
        });
      }
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

  async softDelete(userId: string): Promise<{ ok: true }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), status: UserStatus.DEACTIVATED },
    });

    await this.tokens.revokeAllForUser(userId);

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
