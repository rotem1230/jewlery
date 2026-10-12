import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../../cms/app-config.service';
import { PrismaService } from '../../database/prisma.service';
import { AuthTokens, JwtPayload, SafeUser } from '../interfaces/auth-user.interface';
import { generateSecureToken, hashToken } from '../utils/crypto.util';
import { parseDurationToMs } from '../utils/duration.util';

type TokenTtls = {
  emailVerifyMinutes: number;
  passwordResetMinutes: number;
};

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly appConfig: AppConfigService,
  ) {}

  async issueTokens(user: SafeUser): Promise<AuthTokens> {
    const expiresIn = this.config.get<string>('jwt.expiresIn', '15m');
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn', '7d');

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      activeRole: user.activeRole,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
    const refreshToken = generateSecureToken();
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + parseDurationToMs(refreshExpiresIn));

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        familyId: crypto.randomUUID(),
        expiresAt,
      },
    });

    return { accessToken, refreshToken, expiresIn };
  }

  async rotateRefreshToken(rawRefreshToken: string): Promise<{ userId: string; tokens: AuthTokens }> {
    const tokenHash = hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { user: true },
    });

    if (!existing || existing.expiresAt < new Date() || existing.user.deletedAt) {
      throw new Error('INVALID_REFRESH');
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const { passwordHash: _, ...safe } = existing.user;
    const tokens = await this.issueTokens(safe);
    return { userId: existing.userId, tokens };
  }

  async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every active refresh token for a user (log out everywhere / force re-auth). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async getTokenTtls(): Promise<TokenTtls> {
    const fallback: TokenTtls = {
      emailVerifyMinutes: this.config.get<number>('auth.emailVerifyTtlMinutes', 60 * 24),
      passwordResetMinutes: this.config.get<number>('auth.passwordResetTtlMinutes', 30),
    };

    try {
      const configured = await this.appConfig.get('token_ttls');
      if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
        const c = configured as Record<string, unknown>;
        return {
          emailVerifyMinutes:
            typeof c.emailVerifyMinutes === 'number'
              ? c.emailVerifyMinutes
              : fallback.emailVerifyMinutes,
          passwordResetMinutes:
            typeof c.passwordResetMinutes === 'number'
              ? c.passwordResetMinutes
              : fallback.passwordResetMinutes,
        };
      }
    } catch {
      // AppConfig unavailable (e.g. DB/Redis hiccup) — fall back to env-based TTLs.
    }
    return fallback;
  }

  /** Creates a single-use email verification token and returns the raw (unhashed) value to email. */
  async createEmailVerificationToken(userId: string): Promise<string> {
    const { emailVerifyMinutes } = await this.getTokenTtls();
    const rawToken = generateSecureToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + emailVerifyMinutes * 60_000),
      },
    });
    return rawToken;
  }

  /** Validates and consumes an email verification token. Throws if invalid, used, or expired. */
  async consumeEmailVerificationToken(rawToken: string): Promise<{ userId: string }> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new Error('INVALID_TOKEN');
    }
    await this.prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return { userId: record.userId };
  }

  /** Creates a single-use password reset token and returns the raw (unhashed) value to email. */
  async createPasswordResetToken(userId: string): Promise<string> {
    const { passwordResetMinutes } = await this.getTokenTtls();
    const rawToken = generateSecureToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + passwordResetMinutes * 60_000),
      },
    });
    return rawToken;
  }

  /** Validates and consumes a password reset token. Throws if invalid, used, or expired. */
  async consumePasswordResetToken(rawToken: string): Promise<{ userId: string }> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new Error('INVALID_TOKEN');
    }
    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return { userId: record.userId };
  }
}
