import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider, User, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { MailService } from '../mail/mail.service';
import { AUTH_ERROR } from './constants';
import {
  ForgotPasswordDto,
  LoginDto,
  OAuthLoginDto,
  RefreshDto,
  RegisterDto,
  ResendVerifyDto,
  ResetPasswordDto,
  SwitchRoleDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { AuthResult, SafeUser } from './interfaces/auth-user.interface';
import { verifyOauthIdToken } from './oauth-verify';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  private sanitize(user: User): SafeUser {
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  private async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const rawToken = await this.tokens.createEmailVerificationToken(userId);
    const appUrl = this.config.get<string>('appUrl', 'http://localhost:8081');
    const verifyUrl = `${appUrl}/verify-email?token=${rawToken}`;
    await this.mail.send(
      email,
      'Verify your Malinvosky account',
      `Welcome to Malinvosky! Please confirm your email address by opening this link:\n${verifyUrl}\n\nIf you did not create this account, you can ignore this email.`,
    );
  }

  private async sendPasswordResetEmail(email: string, userId: string): Promise<void> {
    const rawToken = await this.tokens.createPasswordResetToken(userId);
    const appUrl = this.config.get<string>('appUrl', 'http://localhost:8081');
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    await this.mail.send(
      email,
      'Reset your Malinvosky password',
      `We received a request to reset your password. Open this link to choose a new one:\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    );
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    const registrationOpen = this.config.get<boolean>('auth.registrationOpen', true);
    if (!registrationOpen) {
      throw new ForbiddenException({
        success: false,
        message: 'Registration is disabled',
        code: AUTH_ERROR.REGISTRATION_DISABLED,
      });
    }

    const strengthError = await this.password.validateStrength(dto.password);
    if (strengthError) {
      throw new BadRequestException({
        success: false,
        message: strengthError,
        code: AUTH_ERROR.WEAK_PASSWORD,
      });
    }

    const roles = dto.roles.filter((r) => r !== UserRole.ADMIN);
    if (roles.length === 0) {
      throw new BadRequestException({
        success: false,
        message: 'At least one role (DESIGNER or JEWELER) is required',
      });
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) {
      throw new ConflictException({
        success: false,
        message: 'Email already registered',
        code: AUTH_ERROR.EMAIL_EXISTS,
      });
    }

    const passwordHash = await this.password.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roles,
        activeRole: roles[0],
        status: UserStatus.PENDING_VERIFICATION,
      },
    });

    const safe = this.sanitize(user);
    const tokens = await this.tokens.issueTokens(safe);

    // Fire-and-forget: registration should not fail because mail delivery is slow/down.
    await this.sendVerificationEmail(user.id, user.email).catch(() => undefined);

    // Note for API consumers: the account is PENDING_VERIFICATION. These tokens allow
    // read-only bootstrap calls (e.g. resend-verify), but a subsequent `login` will be
    // rejected with code EMAIL_NOT_VERIFIED until `verify-email` is completed.
    return { user: safe, tokens };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException({
        success: false,
        message: 'Invalid email or password',
        code: AUTH_ERROR.INVALID_CREDENTIALS,
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException({
        success: false,
        message: 'Account temporarily locked',
        code: AUTH_ERROR.ACCOUNT_LOCKED,
      });
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
      throw new ForbiddenException({
        success: false,
        message: 'Account is not active',
        code: AUTH_ERROR.ACCOUNT_SUSPENDED,
      });
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException({
        success: false,
        message: 'Please verify your email before logging in',
        code: AUTH_ERROR.EMAIL_NOT_VERIFIED,
      });
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException({
        success: false,
        message: 'Invalid email or password',
        code: AUTH_ERROR.INVALID_CREDENTIALS,
      });
    }

    const ok = await this.password.compare(dto.password, user.passwordHash);
    if (!ok) {
      const maxAttempts = this.config.get<number>('auth.loginMaxAttempts', 5);
      const lockMinutes = this.config.get<number>('auth.loginLockMinutes', 15);
      const attempts = user.loginAttempts + 1;
      const data: { loginAttempts: number; lockedUntil?: Date } = { loginAttempts: attempts };
      if (attempts >= maxAttempts) {
        data.lockedUntil = new Date(Date.now() + lockMinutes * 60_000);
        data.loginAttempts = 0;
      }
      await this.prisma.user.update({ where: { id: user.id }, data });
      throw new UnauthorizedException({
        success: false,
        message: 'Invalid email or password',
        code: AUTH_ERROR.INVALID_CREDENTIALS,
      });
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null },
    });

    const safe = this.sanitize(updated);
    const tokens = await this.tokens.issueTokens(safe);
    return { user: safe, tokens };
  }

  async refresh(dto: RefreshDto): Promise<{ tokens: AuthResult['tokens'] }> {
    try {
      const { tokens } = await this.tokens.rotateRefreshToken(dto.refreshToken);
      return { tokens };
    } catch {
      throw new UnauthorizedException({
        success: false,
        message: 'Invalid refresh token',
        code: AUTH_ERROR.TOKEN_INVALID,
      });
    }
  }

  async logout(refreshToken?: string): Promise<{ ok: true }> {
    if (refreshToken) {
      await this.tokens.revokeRefreshToken(refreshToken);
    }
    return { ok: true };
  }

  me(user: User): SafeUser {
    return this.sanitize(user);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ ok: true }> {
    let result: { userId: string };
    try {
      result = await this.tokens.consumeEmailVerificationToken(dto.token);
    } catch {
      throw new BadRequestException({
        success: false,
        message: 'Invalid or expired verification token',
        code: AUTH_ERROR.TOKEN_INVALID,
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: result.userId } });
    if (!user || user.deletedAt) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid or expired verification token',
        code: AUTH_ERROR.TOKEN_INVALID,
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        status: user.status === UserStatus.PENDING_VERIFICATION ? UserStatus.ACTIVE : user.status,
      },
    });

    return { ok: true };
  }

  async resendVerify(dto: ResendVerifyDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (user && !user.deletedAt && user.status === UserStatus.PENDING_VERIFICATION) {
      await this.sendVerificationEmail(user.id, user.email).catch(() => undefined);
    }
    // Always 200 — do not reveal whether the account exists or is already verified.
    return { ok: true };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (user && !user.deletedAt && user.status !== UserStatus.DEACTIVATED) {
      await this.sendPasswordResetEmail(user.email, user.id).catch(() => undefined);
    }
    // Always 200 — do not reveal whether the account exists.
    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    let result: { userId: string };
    try {
      result = await this.tokens.consumePasswordResetToken(dto.token);
    } catch {
      throw new BadRequestException({
        success: false,
        message: 'Invalid or expired reset token',
        code: AUTH_ERROR.TOKEN_INVALID,
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
    await this.prisma.user.update({
      where: { id: result.userId },
      data: { passwordHash, loginAttempts: 0, lockedUntil: null },
    });

    // Reset invalidates every existing session as a security precaution.
    await this.tokens.revokeAllForUser(result.userId);

    return { ok: true };
  }

  async switchRole(user: User, dto: SwitchRoleDto): Promise<AuthResult> {
    if (!user.roles.includes(dto.role)) {
      throw new ForbiddenException({
        success: false,
        message: 'Role is not assigned to this account',
        code: AUTH_ERROR.ROLE_NOT_ASSIGNED,
      });
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { activeRole: dto.role },
    });

    const safe = this.sanitize(updated);
    const tokens = await this.tokens.issueTokens(safe);
    return { user: safe, tokens };
  }

  async revokeAll(userId: string): Promise<{ ok: true }> {
    await this.tokens.revokeAllForUser(userId);
    return { ok: true };
  }

  /**
   * Google/Apple sign-in gated by `phase3_oauth`. Unsigned or unverifiable idTokens are rejected.
   */
  async oauthLogin(provider: AuthProvider, dto: OAuthLoginDto): Promise<AuthResult> {
    const enabled = await this.featureFlags.isEnabled('phase3_oauth');
    if (!enabled) {
      throw new ForbiddenException({
        success: false,
        message: `${provider} sign-in is not enabled`,
        code: 'FEATURE_DISABLED',
      });
    }

    const identity = await verifyOauthIdToken(provider, dto.idToken, {
      googleClientId: this.config.get<string>('google.clientId'),
      appleClientId: this.config.get<string>('apple.clientId'),
    });
    const subject = identity.subject;

    let user = await this.prisma.user.findFirst({ where: { authProvider: provider, authProviderSub: subject } });
    if (!user) {
      const email =
        identity.email?.toLowerCase() ??
        dto.email?.toLowerCase() ??
        `${provider.toLowerCase()}.${subject}@oauth.placeholder.mailnvosky.local`;
      const existingByEmail = await this.prisma.user.findUnique({ where: { email } });
      if (existingByEmail) {
        throw new ConflictException({
          success: false,
          message: 'Email already registered with a different sign-in method',
          code: AUTH_ERROR.EMAIL_EXISTS,
        });
      }

      user = await this.prisma.user.create({
        data: {
          email,
          authProvider: provider,
          authProviderSub: subject,
          firstName: identity.firstName ?? dto.firstName,
          lastName: identity.lastName ?? dto.lastName,
          roles: [UserRole.DESIGNER],
          activeRole: UserRole.DESIGNER,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });
    }

    if (user.deletedAt || user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
      throw new ForbiddenException({
        success: false,
        message: 'Account is not active',
        code: AUTH_ERROR.ACCOUNT_SUSPENDED,
      });
    }

    const safe = this.sanitize(user);
    const tokens = await this.tokens.issueTokens(safe);
    return { user: safe, tokens };
  }
}
