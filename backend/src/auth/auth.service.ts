import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider, Prisma, User, UserRole, UserStatus } from '@prisma/client';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { PrismaService } from '../database/prisma.service';
import { sqlTimestamp } from '../database/sql-time';
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
  AddRoleDto,
  SwitchRoleDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { AuditService } from '../audit/audit.service';
import { AuthResult, RegisterResult, SafeUser } from './interfaces/auth-user.interface';
import { OAuthTokenVerifier } from './oauth/oauth-token-verifier';
import { PasswordService } from './services/password.service';
import { InvalidTokenError, TokenService } from './services/token.service';
import { lockUser } from '../database/row-locks';

const HOUR_MS = 60 * 60 * 1000;

/** Account statuses a sign-in opens a session for (the others are refused with their reason). */
const SIGN_IN_STATUSES: UserStatus[] = [UserStatus.ACTIVE];

function sessionEnded(): UnauthorizedException {
  return new UnauthorizedException({
    success: false,
    message: 'Session ended',
    code: AUTH_ERROR.TOKEN_INVALID,
  });
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    success: false,
    message: 'Invalid email or password',
    code: AUTH_ERROR.INVALID_CREDENTIALS,
  });
}

function accountLocked(): ForbiddenException {
  return new ForbiddenException({
    success: false,
    message: 'Account temporarily locked. Try again later or reset your password.',
    code: AUTH_ERROR.ACCOUNT_LOCKED,
  });
}

function invalidResetToken(): BadRequestException {
  return new BadRequestException({
    success: false,
    message: 'Invalid or expired reset token',
    code: AUTH_ERROR.TOKEN_INVALID,
  });
}

function tooManyRequests(message: string): HttpException {
  return new HttpException(
    { success: false, message, code: AUTH_ERROR.TOO_MANY_ATTEMPTS },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private readonly pendingMail = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly limiter: RateLimiterService,
    private readonly oauthVerifier: OAuthTokenVerifier,
    private readonly audit: AuditService,
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

  /**
   * Creates a verification / reset token unless the account reached its hourly mail cap (so the
   * endpoints cannot flood an inbox). Count and insert run under the user's row lock, so
   * simultaneous requests cannot all pass the check.
   */
  private async issueMailToken(kind: 'verify' | 'reset', userId: string): Promise<string | null> {
    const cap = this.config.get<number>('auth.mailsPerAccountPerHour', 3);
    // Before the transaction: nothing inside it may wait for a second database connection.
    const ttls = await this.tokens.getTokenTtls();
    return this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const recent = await this.tokens.countRecentMailTokens(kind, userId, new Date(Date.now() - HOUR_MS), tx);
      if (recent >= cap) {
        return null;
      }
      return kind === 'verify'
        ? this.tokens.createEmailVerificationToken(userId, tx, ttls)
        : this.tokens.createPasswordResetToken(userId, tx, ttls);
    });
  }

  /**
   * Mail goes out after the response: SMTP latency must neither slow requests down nor reveal
   * (by timing) whether an account exists. Pending deliveries are awaited on shutdown.
   */
  private sendInBackground(what: string, work: () => Promise<void>): void {
    const job: Promise<void> = work()
      .catch((err: Error) => this.logger.warn(`${what} failed: ${err.message}`))
      .finally(() => this.pendingMail.delete(job));
    this.pendingMail.add(job);
  }

  /**
   * Waits until no mail is pending, including mail queued while waiting (a request that was
   * still being handled when shutdown began).
   */
  async drainPendingMail(): Promise<void> {
    while (this.pendingMail.size > 0) {
      await Promise.allSettled([...this.pendingMail]);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.drainPendingMail();
  }

  /** Sends a verification link unless the account reached its mail cap; true when mailed. */
  private async sendVerificationEmail(userId: string, email: string): Promise<boolean> {
    const rawToken = await this.issueMailToken('verify', userId);
    if (!rawToken) {
      return false;
    }
    await this.mail.send(
      email,
      'Verify your Malinvosky account',
      `Welcome to Malinvosky! Please confirm your email address by opening this link:\n${this.hostedPageUrl('verify-email', rawToken)}\n\nIf you did not create this account, you can ignore this email.`,
    );
    return true;
  }

  /**
   * Operator tool (npm run cli:resend-verification): accounts created before e-mail verification
   * was enforced are PENDING and cannot sign in; this mails each of them a fresh link (the
   * per-account mail cap still applies, so re-running it cannot flood an inbox).
   */
  async resendVerificationToPendingAccounts(options: { dryRun?: boolean; limit?: number }): Promise<{
    candidates: number;
    sent: number;
  }> {
    const pending = await this.prisma.user.findMany({
      where: { status: UserStatus.PENDING_VERIFICATION, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: options.limit ?? 1000,
      select: { id: true, email: true },
    });
    if (options.dryRun) {
      return { candidates: pending.length, sent: 0 };
    }
    let sent = 0;
    for (const user of pending) {
      try {
        if (await this.sendVerificationEmail(user.id, user.email)) {
          sent += 1;
        }
      } catch (err) {
        this.logger.warn(`Verification mail for user ${user.id} failed: ${(err as Error).message}`);
      }
    }
    return { candidates: pending.length, sent };
  }

  private async sendPasswordResetEmail(email: string, userId: string): Promise<void> {
    const rawToken = await this.issueMailToken('reset', userId);
    if (!rawToken) {
      return;
    }
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
          phone: dto.phone ?? null,
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
    this.sendInBackground(`Verification mail for user ${user.id}`, async () => {
      await this.sendVerificationEmail(user.id, user.email);
    });

    return { user: this.sanitize(user), requiresEmailVerification: true };
  }

  async login(dto: LoginDto, clientIp: string): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const budgetKey = `auth-login:${clientIp}:${email}`;
    const allowed = await this.limiter.consume(
      budgetKey,
      this.config.get<number>('auth.loginThrottleLimit', 5),
      this.config.get<number>('auth.loginThrottleWindowMs', 15 * 60_000),
    );
    if (!allowed) {
      throw tooManyRequests('Too many sign-in attempts, please try again later');
    }

    const found = await this.prisma.user.findUnique({ where: { email } });
    const user = found && !found.deletedAt ? found : null;
    const maxAttempts = this.config.get<number>('auth.loginMaxAttempts', 10);
    const lockMinutes = this.config.get<number>('auth.loginLockMinutes', 15);

    if (!user) {
      // Unknown addresses go through the same lockout as accounts, so the sequence of answers
      // does not reveal whether an account exists.
      const allowed = await this.limiter.consume(`auth-login-unknown:${email}`, maxAttempts, lockMinutes * 60_000);
      if (!allowed) {
        throw accountLocked();
      }
      await this.password.compareAgainstDummy(dto.password);
      throw invalidCredentials();
    }

    // The attempt is counted before the password is evaluated, so simultaneous guesses cannot
    // evaluate more passwords than the limit; a locked account is refused without evaluating it.
    const attempt = await this.reserveLoginAttempt(user.id, maxAttempts, lockMinutes);
    if (attempt === 'locked') {
      throw accountLocked();
    }

    const passwordOk =
      user.passwordHash != null
        ? await this.password.compare(dto.password, user.passwordHash)
        : await this.password.compareAgainstDummy(dto.password);
    if (!passwordOk) {
      if (attempt >= maxAttempts) {
        await this.lockAccount(user.id, lockMinutes);
      }
      throw invalidCredentials();
    }

    // Under the account lock, the session is created only if the password just proven is still the
    // account's: a password change or reset that committed meanwhile ended every session, and this
    // sign-in used the old password. Ending all sessions takes the same lock, so it either comes
    // first (and is seen here) or waits and also ends the session created here.
    const outcome = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (current.deletedAt || current.passwordHash !== user.passwordHash) {
        return null;
      }
      // The password is proven: earlier failures no longer count, whatever the account's status
      // (an unverified owner signing in correctly must not lock themselves out).
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { loginAttempts: 0, lockedUntil: null },
      });
      if (!SIGN_IN_STATUSES.includes(updated.status)) {
        return { updated, tokens: null };
      }
      return { updated, tokens: await this.tokens.issueTokens(this.sanitize(updated), undefined, tx) };
    });
    if (!outcome) {
      throw invalidCredentials();
    }
    const { updated, tokens } = outcome;

    // Status is only revealed to someone who proved knowledge of the password.
    if (updated.status === UserStatus.SUSPENDED || updated.status === UserStatus.DEACTIVATED) {
      throw new ForbiddenException({
        success: false,
        message: 'Account is not active',
        code: AUTH_ERROR.ACCOUNT_SUSPENDED,
      });
    }
    if (updated.status === UserStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException({
        success: false,
        message: 'Please verify your email before logging in',
        code: AUTH_ERROR.EMAIL_NOT_VERIFIED,
      });
    }
    if (!tokens) {
      throw invalidCredentials();
    }

    // The budget limits guessing: a sign-in that proved the password does not use it up (the
    // wrong guesses before it still count).
    await this.limiter.refund(budgetKey);
    return { user: this.sanitize(updated), tokens };
  }

  /**
   * Checks the account password for an action taken from a signed-in session (password change).
   * A wrong guess counts toward the same lockout as a sign-in, so a stolen session cannot be used
   * to guess the password; a right one clears the count. Throws ACCOUNT_LOCKED while locked.
   */
  async verifyCurrentPassword(userId: string, passwordHash: string, password: string): Promise<boolean> {
    const maxAttempts = this.config.get<number>('auth.loginMaxAttempts', 10);
    const lockMinutes = this.config.get<number>('auth.loginLockMinutes', 15);
    const attempt = await this.reserveLoginAttempt(userId, maxAttempts, lockMinutes);
    if (attempt === 'locked') {
      throw accountLocked();
    }
    if (!(await this.password.compare(password, passwordHash))) {
      if (attempt >= maxAttempts) {
        await this.lockAccount(userId, lockMinutes);
      }
      return false;
    }
    await this.prisma.user.update({ where: { id: userId }, data: { loginAttempts: 0, lockedUntil: null } });
    return true;
  }

  /**
   * Atomically counts a sign-in attempt on an account that is not locked and returns its number.
   * Attempts beyond the limit lock the account (time-bounded, so a crashed request cannot leave
   * it refusing forever).
   */
  private async reserveLoginAttempt(userId: string, maxAttempts: number, lockMinutes: number): Promise<number | 'locked'> {
    const rows = await this.prisma.$queryRaw<Array<{ loginAttempts: number }>>`
      UPDATE "users" SET "loginAttempts" = "loginAttempts" + 1
       WHERE "id" = ${userId}::uuid
         AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${sqlTimestamp(new Date())})
      RETURNING "loginAttempts"`;
    if (rows.length === 0) {
      return 'locked';
    }
    const attempt = rows[0].loginAttempts;
    if (attempt > maxAttempts) {
      await this.lockAccount(userId, lockMinutes);
      return 'locked';
    }
    return attempt;
  }

  private async lockAccount(userId: string, lockMinutes: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + lockMinutes * 60_000), loginAttempts: 0 },
    });
    this.logger.warn(`Account ${userId} locked after repeated failed sign-ins`);
  }

  async refresh(dto: RefreshDto): Promise<{ tokens: AuthResult['tokens'] }> {
    try {
      const { tokens } = await this.tokens.rotateRefreshToken(dto.refreshToken);
      return { tokens };
    } catch (err) {
      // Only a bad token is a 401 (the app then signs out); an outage must stay retryable.
      if (!(err instanceof InvalidTokenError)) {
        throw err;
      }
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

  /**
   * Following the mailed link proves control of the mailbox; a lockout from sign-in attempts made
   * before it (typically the owner mistyping while unverified) is lifted with it.
   */
  private async markEmailVerified(user: User): Promise<void> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        status: user.status === UserStatus.PENDING_VERIFICATION ? UserStatus.ACTIVE : user.status,
        loginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async resendVerify(dto: ResendVerifyDto, clientIp: string): Promise<{ ok: true }> {
    await this.assertMailBudget(clientIp);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (user && !user.deletedAt && user.status === UserStatus.PENDING_VERIFICATION) {
      this.sendInBackground(`Verification mail for user ${user.id}`, async () => {
        await this.sendVerificationEmail(user.id, user.email);
      });
    }
    // Always 200 — do not reveal whether the account exists or is already verified.
    return { ok: true };
  }

  async forgotPassword(dto: ForgotPasswordDto, clientIp: string): Promise<{ ok: true }> {
    await this.assertMailBudget(clientIp);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (user && !user.deletedAt && user.status !== UserStatus.DEACTIVATED) {
      this.sendInBackground(`Reset mail for user ${user.id}`, () => this.sendPasswordResetEmail(user.email, user.id));
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

    // Cheap check first, so an invalid link never costs a password hash.
    const token = await this.tokens.findUsablePasswordResetToken(dto.token);
    if (!token) {
      throw invalidResetToken();
    }
    const passwordHash = await this.password.hash(dto.newPassword);

    // Under the account lock: the token is redeemed (with every other reset link of the account),
    // the password replaced and every session ended in one step, so two links cannot both succeed
    // and no session from before the reset survives it.
    const user = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, token.userId);
      if (!(await this.tokens.redeemPasswordResetToken(tx, token.id, token.userId))) {
        return null;
      }
      const current = await tx.user.findUnique({ where: { id: token.userId } });
      if (!current || current.deletedAt || current.status === UserStatus.DEACTIVATED) {
        return null;
      }
      const updated = await tx.user.update({
        where: { id: current.id },
        data: {
          passwordHash,
          loginAttempts: 0,
          lockedUntil: null,
          // Following the mailed link proves control of the mailbox.
          emailVerifiedAt: current.emailVerifiedAt ?? new Date(),
          status: current.status === UserStatus.PENDING_VERIFICATION ? UserStatus.ACTIVE : current.status,
        },
      });
      await this.tokens.endAllSessions(tx, current.id);
      return updated;
    });
    if (!user) {
      throw invalidResetToken();
    }
    this.tokens.announceSessionsEnded(user.id);

    return { ok: true };
  }

  /** Adds the designer or jeweler role (PRD 5.1: a user can be both); the active role stays. */
  async addRole(user: User, dto: AddRoleDto): Promise<AuthResult> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (
        current.deletedAt ||
        current.sessionVersion !== user.sessionVersion ||
        !SIGN_IN_STATUSES.includes(current.status)
      ) {
        return null;
      }
      const added = !current.roles.includes(dto.role);
      const updated = added
        ? await tx.user.update({ where: { id: user.id }, data: { roles: { push: dto.role } } })
        : current;
      const safe = this.sanitize(updated);
      return { added, result: { user: safe, tokens: await this.tokens.issueTokens(safe, undefined, tx) } };
    });
    if (!outcome) {
      throw sessionEnded();
    }
    if (outcome.added) {
      await this.audit.log({
        actorUserId: user.id,
        action: 'user.role_added',
        entityType: 'User',
        entityId: user.id,
        after: { role: dto.role },
      });
    }
    return outcome.result;
  }

  async switchRole(user: User, dto: SwitchRoleDto): Promise<AuthResult> {
    if (!user.roles.includes(dto.role)) {
      throw new ForbiddenException({
        success: false,
        message: 'Role is not assigned to this account',
        code: AUTH_ERROR.ROLE_NOT_ASSIGNED,
      });
    }

    // Under the account lock, and only while the session this request came with is still current:
    // ending all sessions while it waited ends it too, and must not be followed by a new pair.
    const outcome = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (
        current.deletedAt ||
        current.sessionVersion !== user.sessionVersion ||
        !SIGN_IN_STATUSES.includes(current.status)
      ) {
        return null;
      }
      const updated = await tx.user.update({ where: { id: user.id }, data: { activeRole: dto.role } });
      const safe = this.sanitize(updated);
      return { user: safe, tokens: await this.tokens.issueTokens(safe, undefined, tx) };
    });
    if (!outcome) {
      throw sessionEnded();
    }
    return outcome;
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
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
          throw err;
        }
        // Either a concurrent first sign-in with this identity created the row first, or the
        // e-mail was just taken by another sign-up.
        user = await this.prisma.user.findFirst({ where: { authProvider: provider, authProviderSub: subject } });
        if (!user) {
          throw new ConflictException({
            success: false,
            message: 'Email already registered with a different sign-in method',
            code: AUTH_ERROR.EMAIL_EXISTS,
          });
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
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      // An account created before sign-in verified e-mails: activated only when the provider
      // vouches for the same address.
      if (!identity.email || identity.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new ForbiddenException({
          success: false,
          message: 'Please verify your email before signing in',
          code: AUTH_ERROR.EMAIL_NOT_VERIFIED,
        });
      }
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      });
    }

    const safe = this.sanitize(user);
    const tokens = await this.tokens.issueTokens(safe);
    return { user: safe, tokens };
  }
}
