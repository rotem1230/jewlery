import { BadRequestException, Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../authorization/decorators/public.decorator';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import {
  AUTH_PAGE_CSP,
  emailVerifiedPage,
  invalidLinkPage,
  isWellFormedToken,
  passwordResetDonePage,
  resetPasswordFormPage,
  verifyEmailFormPage,
} from './web/auth-pages';

function send(res: Response, status: number, html: string): void {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', AUTH_PAGE_CSP);
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.send(html);
}

/**
 * Landing pages for e-mailed links. GET only renders a form (mail scanners prefetch links, so a
 * GET must never consume a single-use token); the POST performs the action.
 */
@ApiExcludeController()
@Public()
@Controller('auth/web')
export class AuthWebController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Get('verify-email')
  async verifyEmailPage(@Query('token') token: unknown, @Res() res: Response): Promise<void> {
    if (!isWellFormedToken(token) || !(await this.tokens.isEmailVerificationTokenUsable(token))) {
      return send(res, 400, invalidLinkPage());
    }
    send(res, 200, verifyEmailFormPage(token));
  }

  @Post('verify-email')
  async verifyEmailSubmit(@Body() body: Record<string, unknown>, @Res() res: Response): Promise<void> {
    const token = body?.token;
    if (!isWellFormedToken(token)) {
      return send(res, 400, invalidLinkPage());
    }
    try {
      await this.auth.verifyEmail({ token });
    } catch (err) {
      if (err instanceof BadRequestException) {
        return send(res, 400, invalidLinkPage());
      }
      throw err;
    }
    send(res, 200, emailVerifiedPage());
  }

  @Get('reset-password')
  async resetPasswordPage(@Query('token') token: unknown, @Res() res: Response): Promise<void> {
    if (!isWellFormedToken(token) || !(await this.tokens.isPasswordResetTokenUsable(token))) {
      return send(res, 400, invalidLinkPage());
    }
    send(res, 200, resetPasswordFormPage(token));
  }

  @Post('reset-password')
  async resetPasswordSubmit(@Body() body: Record<string, unknown>, @Res() res: Response): Promise<void> {
    const { token, newPassword, confirmPassword } = body ?? {};
    if (!isWellFormedToken(token)) {
      return send(res, 400, invalidLinkPage());
    }
    if (typeof newPassword !== 'string' || newPassword.length > 128) {
      return send(res, 400, resetPasswordFormPage(token, 'נא להזין סיסמה / Enter a password'));
    }
    if (newPassword !== confirmPassword) {
      return send(res, 400, resetPasswordFormPage(token, 'הסיסמאות אינן תואמות / Passwords do not match'));
    }
    try {
      await this.auth.resetPassword({ token, newPassword });
    } catch (err) {
      if (err instanceof BadRequestException) {
        const payload = err.getResponse() as { message?: string; code?: string };
        if (payload.code === 'WEAK_PASSWORD') {
          return send(res, 400, resetPasswordFormPage(token, payload.message ?? 'Weak password'));
        }
        return send(res, 400, invalidLinkPage());
      }
      throw err;
    }
    send(res, 200, passwordResetDonePage());
  }
}
