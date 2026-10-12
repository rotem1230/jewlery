import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider, Prisma, User, UserRole, UserStatus } from '@prisma/client';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
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
import { AuthResult, RegisterResult, SafeUser } from './interfaces/auth-user.interface';
import { OAuthTokenVerifier } from './oauth/oauth-token-verifier';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

const HOUR_MS = 60 * 60 * 1000;

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    success: false,
    message: 'Invalid email or password',
    code: AUTH_ERROR.INVALID_CREDENTIALS,
  });
}

function tooManyRequests(message: string): HttpException {
  return new HttpException(
    { success: false, message, code: AUTH_ERROR.TOO_MANY_ATTEMPTS },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly limiter: RateLimiterService,
    private readonly oauthVerifier: OAuthTokenVerifier,
  ) {}

  private sanitize(user: User): SafeUser {
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  private hostedPageUrl(page: 'verify-email' | 'reset-password', rawToken: string): string {
    const base = this.config.get<string>('apiPublicUrl', 'http://localhost:3000');
    const prefix = this.config.get<string>('apiPrefix', 'api/v1');
    return `${base}/${prefix}/auth/web/${page}?token=${rawToken}`;
  }

  /** Per client budget for endpoints that send mail (register / forgot / resend). */
  private async assertMailBudget(clientIp: string): Promise<void> {
    const allowed = await this.limiter.consume(
      `auth-mail:${clientIp}`,
      this.config.get<number>('auth.mailThrottleLimit', 10),
      this.config.get<number>('auth.mailThrottleWindowMs', HOUR_MS),
    );
    if (!allowed) {
      throw tooManyRequests('Too many requests, please try again later');
    }
  }

  /** Per account cap so the mail endpoints cannot be used to flood someone's inbox. */
  private async underAccountMailCap(kind: 'verify' | 'reset', userId: string): Promise<boolean> {
    const cap = this.config.get<number>('auth.mailsPerAccountPerHour', 3);
    const recent = await this.tokens.countRecentMailTokens(kind, userId, new Date(Date.now() - HOUR_MS));
    return recent < cap;
  }

  private async sendVerificationEmail(userId: string, email: string): Promise<void> {
    if (!(await this.underAccountMailCap('verify', userId))) {
      return;
    }
    const rawToken = await this.tokens.createEmailVerificationToken(userId);
    await this.mail.send(
      email,
      'Verify your Malinvosky account',
      `Welcome to Malinvosky! Please confirm your email address by opening this link:\n${this.hostedPageUrl('verify-email', rawToken)}\n\nIf you did not create this account, you can ignore this email.`,
    );
  }

  private async sendPasswordResetEmail(email: string, userId: string): Promise<void> {
    if (!(await this.underAccountMailCap('reset', userId))) {
      return;
    }
    const rawToken = await this.tokens.createPasswordResetToken(userId);
    await this.mail.send(
      email,
      'Reset your Malinvosky password',
      `We received a request to reset your password. Open this link to choose a new one:\n${this.hostedPageUrl('reset-password', rawToken)}\n\nIf you did not request this, you can safely ignore this email.`,
    );
  }

  /**
   * Creates a PENDING_VERIFICATION account and mails a verification link. No session is issued:
   * the account becomes usable only after the e-mail is verified and the user signs in.
   */
  async register(dto: RegisterDto, clientIp: string): Promise<RegisterResult> {
    const registrationOpen = this.config.get<boolean>('auth.registrationOpen', true);
    if (!registrationOpen) {
      throw new ForbiddenException({
        success: false,
        message: 'Registration is disabled',
        code: AUTH_ERROR.REGISTRATION_DISABLED,
      });
    }
    await this.assertMailBudget(clientIp);

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

    const email = dto.email.toLowerCase();
    const emailTaken = () =>
      new ConflictException({
        success: false,
        message: 'Email already registered',
        code: AUTH_ERROR.EMAIL_EXISTS,
      });
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw emailTaken();
    }

    const passwordHash = await this.password.hash(dto.password);
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          roles,
          activeRole: roles[0],
          status: UserStatus.PENDING_VERIFICATION,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw emailTaken();
      }
      throw err;
    }

    // Registration must not fail because mail delivery is slow or down; the user can re-send.
    await this.sendVerificationEmail(user.id, user.email).catch((err: Error) =>
      this.logger.warn(`Verification mail failed for user ${user.id}: ${err.message}`),
    );

    return { user: this.sanitize(user), requiresEmailVerification: true };
  }

  async login(dto: LoginDto, clientIp: string): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const allowed = await this.limiter.consume(
      `auth-login:${clientIp}:${email}`,
      this.config.get<number>('auth.loginThrottleLimit', 5),
      this.config.get<number>('auth.loginThrottleWindowMs', 15 * 60_000),
    );
    if (!allowed) {
      throw tooManyRequests('Too many sign-in attempts, please try again later');
    }

    const found = await this.prisma.user.findUnique({ where: { email } });
    const user = found && !found.deletedAt ? found : null;

    // A locked account is refused without evaluating the password, so the lock cannot be used
    // as an oracle for guessing it.
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException({
        success: false,
        message: 'Account temporarily locked. Try again later or reset your password.',
        code: AUTH_ERROR.ACCOUNT_LOCKED,
      });
    }

    const passwordOk =
      user?.passwordHash != null
        ? await this.password.compare(dto.password, user.passwordHash)
        : await this.password.compareAgainstDummy(dto.password);
    if (!user || !passwordOk) {
      if (user) {
        await this.recordFailedLogin(user.id);
      }
      throw invalidCredentials();
    }

    // Status is only revealed to someone who proved knowledge of the password.
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

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null },
    });
    const safe = this.sanitize(updated);
    return { user: safe, tokens: await this.tokens.issueTokens(safe) };
  }

  /** Atomic increment; the attempt that reaches the threshold locks the account. */
  private async recordFailedLogin(userId: string): Promise<void> {
    const maxAttempts = this.config.get<number>('auth.loginMaxAttempts', 10);
    const lockMinutes = this.config.get<number>('auth.loginLockMinutes', 15);
    const after = await this.prisma.user.update({
      where: { id: userId },
      data: { loginAttempts: { increment: 1 } },
      select: { loginAttempts: true },
    });
    if (after.loginAttempts >= maxAttempts) {
      await this.prisma.user.updateMany({
        where: { id: userId, loginAttempts: { gte: maxAttempts } },
        data: { lockedUntil: new Date(Date.now() + lockMinutes * 60_000), loginAttempts: 0 },
      });
      this.logger.warn(`Account ${userId} locked after ${maxAttempts} failed sign-ins`);
    }
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

    await this.markEmailVerified(user);
    return { ok: true };
  }

  private async markEmailVerified(user: User): Promise<void> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        status: user.status === UserStatus.PENDING_VERIFICATION ? UserStatus.ACTIVE : user.status,
      },
    });
  }

  async resendVerify(dto: ResendVerifyDto, clientIp: string): Promise<{ ok: true }> {
    await this.assertMailBudget(clientIp);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (user && !user.deletedAt && user.status === UserStatus.PENDING_VERIFICATION) {
      await this.sendVerificationEmail(user.id, user.email).catch((err: Error) =>
        this.logger.warn(`Verification mail failed for user ${user.id}: ${err.message}`),
      );
    }
    // Always 200 — do not reveal whether the account exists or is already verified.
    return { ok: true };
  }

  async forgotPassword(dto: ForgotPasswordDto, clientIp: string): Promise<{ ok: true }> {
    await this.assertMailBudget(clientIp);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (user && !user.deletedAt && user.status !== UserStatus.DEACTIVATED) {
      await this.sendPasswordResetEmail(user.email, user.id).catch((err: Error) =>
        this.logger.warn(`Reset mail failed for user ${user.id}: ${err.message}`),
      );
    }
    // Always 200 — do not reveal whether the account exists.
    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    // Validate first: a rejected password must not burn the single-use token.
    const strengthError = await this.password.validateStrength(dto.newPassword);
    if (strengthError) {
      throw new BadRequestException({
        success: false,
        message: strengthError,
        code: AUTH_ERROR.WEAK_PASSWORD,
      });
    }

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

    const user = await this.prisma.user.findUnique({ where: { id: result.userId } });
    if (!user || user.deletedAt || user.status === UserStatus.DEACTIVATED) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid or expired reset token',
        code: AUTH_ERROR.TOKEN_INVALID,
      });
    }

    const passwordHash = await this.password.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        loginAttempts: 0,
        lockedUntil: null,
        // Following the mailed link proves control of the mailbox.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        status: user.status === UserStatus.PENDING_VERIFICATION ? UserStatus.ACTIVE : user.status,
      },
    });

    // Reset invalidates every existing session as a security precaution.
    await this.tokens.revokeAllForUser(user.id);

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
   * Google/Apple sign-in gated by `phase3_oauth`. The identity comes only from the verified
   * ID token: the e-mail is used only when the provider asserts it is verified, and anything the
   * client sends about e-mail is ignored.
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

    const identity = await this.oauthVerifier.verify(provider, dto.idToken);
    const subject = identity.subject;

    let user = await this.prisma.user.findFirst({ where: { authProvider: provider, authProviderSub: subject } });
    if (!user) {
      const email =
        identity.email?.toLowerCase() ?? `${provider.toLowerCase()}.${subject}@oauth.placeholder.mailnvosky.local`;
      const existingByEmail = await this.prisma.user.findUnique({ where: { email } });
      if (existingByEmail) {
        throw new ConflictException({
          success: false,
          message: 'Email already registered with a different sign-in method',
          code: AUTH_ERROR.EMAIL_EXISTS,
        });
      }

      try {
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
            emailVerifiedAt: identity.email ? new Date() : null,
          },
        });
      } catch (err) {
        // A concurrent first sign-in with the same identity created the row first.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          user = await this.prisma.user.findFirst({ where: { authProvider: provider, authProviderSub: subject } });
        }
        if (!user) {
          throw err;
        }
      }
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
