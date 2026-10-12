import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../../cms/app-config.service';
import { PrismaService } from '../../database/prisma.service';
import { AuthTokens, JwtPayload, SafeUser } from '../interfaces/auth-user.interface';
import { generateSecureToken, hashToken } from '../utils/crypto.util';
import { parseDurationToMs } from '../utils/duration.util';

type TokenTtls = {
  emailVerifyMinutes: number;
  passwordResetMinutes: number;
};

const REFRESHABLE_STATUSES: UserStatus[] = [UserStatus.ACTIVE];

type Db = Prisma.TransactionClient;

export class InvalidTokenError extends Error {
  constructor(reason: string) {
    super(reason);
  }
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly appConfig: AppConfigService,
  ) {}

  /** Issues an access token and a refresh token; `familyId` keeps a rotation chain together. */
  async issueTokens(user: SafeUser, familyId: string = randomUUID(), db: Db = this.prisma): Promise<AuthTokens> {
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

    await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + parseDurationToMs(refreshExpiresIn)),
      },
    });

    return { accessToken, refreshToken, expiresIn };
  }

  /**
   * Rotates a refresh token. A token is redeemable once: presenting an already-rotated token
   * (replay, or losing a concurrent race) is treated as theft and revokes the whole family.
   */
  async rotateRefreshToken(rawRefreshToken: string): Promise<{ userId: string; tokens: AuthTokens }> {
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hashToken(rawRefreshToken) },
      include: { user: true },
    });
    if (!existing) {
      throw new InvalidTokenError('unknown refresh token');
    }
    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      throw new InvalidTokenError('refresh token reuse');
    }
    if (existing.expiresAt <= new Date()) {
      throw new InvalidTokenError('refresh token expired');
    }
    const { user } = existing;
    if (user.deletedAt || !REFRESHABLE_STATUSES.includes(user.status)) {
      await this.revokeFamily(existing.familyId);
      throw new InvalidTokenError('account cannot refresh');
    }

    // Claim and successor in one transaction: a failure in between must not leave the user with
    // a revoked token (whose next use would look like theft) and no replacement.
    const { passwordHash: _ignored, ...safe } = user;
    const tokens = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return claimed.count === 1 ? this.issueTokens(safe, existing.familyId, tx) : null;
    });
    if (!tokens) {
      await this.revokeFamily(existing.familyId);
      throw new InvalidTokenError('refresh token reuse');
    }
    return { userId: existing.userId, tokens };
  }

  async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawRefreshToken), revokedAt: null },
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

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
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
  async createEmailVerificationToken(userId: string, db: Db = this.prisma): Promise<string> {
    const { emailVerifyMinutes } = await this.getTokenTtls();
    const rawToken = generateSecureToken();
    await db.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + emailVerifyMinutes * 60_000),
      },
    });
    return rawToken;
  }

  /** Validates and atomically consumes an email verification token (first caller wins). */
  async consumeEmailVerificationToken(rawToken: string): Promise<{ userId: string }> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!record) {
      throw new InvalidTokenError('unknown token');
    }
    const claimed = await this.prisma.emailVerificationToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new InvalidTokenError('token used or expired');
    }
    return { userId: record.userId };
  }

  /** True when the token exists, is unused and unexpired (no side effects). */
  async isPasswordResetTokenUsable(rawToken: string): Promise<boolean> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    return !!record && !record.usedAt && record.expiresAt > new Date();
  }

  /** True when the token exists, is unused and unexpired (no side effects). */
  async isEmailVerificationTokenUsable(rawToken: string): Promise<boolean> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    return !!record && !record.usedAt && record.expiresAt > new Date();
  }

  /** Creates a single-use password reset token and returns the raw (unhashed) value to email. */
  async createPasswordResetToken(userId: string, db: Db = this.prisma): Promise<string> {
    const { passwordResetMinutes } = await this.getTokenTtls();
    const rawToken = generateSecureToken();
    await db.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + passwordResetMinutes * 60_000),
      },
    });
    return rawToken;
  }

  /** A reset token that is unused and unexpired right now (no side effects). */
  async findUsablePasswordResetToken(rawToken: string): Promise<{ id: string; userId: string } | null> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    return record && !record.usedAt && record.expiresAt > new Date() ? { id: record.id, userId: record.userId } : null;
  }

  /**
   * Consumes a reset token inside the caller's transaction, which must hold the user's row lock.
   * Every other outstanding reset link of the account stops working too: one mailbox round-trip
   * allows exactly one reset.
   */
  async redeemPasswordResetToken(tx: Db, tokenId: string, userId: string): Promise<boolean> {
    const now = new Date();
    const own = await tx.passwordResetToken.updateMany({
      where: { id: tokenId, userId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (own.count !== 1) {
      return false;
    }
    await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
    return true;
  }

  /** Number of verification / reset mails created for the user since `since` (mail cap). */
  async countRecentMailTokens(kind: 'verify' | 'reset', userId: string, since: Date, db: Db = this.prisma): Promise<number> {
    const where = { userId, createdAt: { gt: since } };
    return kind === 'verify'
      ? db.emailVerificationToken.count({ where })
      : db.passwordResetToken.count({ where });
  }
}
