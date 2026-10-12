import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthProvider, User } from '@prisma/client';
import { Request } from 'express';
import { Public } from '../authorization/decorators/public.decorator';
import { JwtAuthGuard } from '../authorization/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
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

type AuthedRequest = Request & { user: User };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register a new account',
    description:
      'Creates the account with status PENDING_VERIFICATION and emails a verification link. ' +
      'Tokens are returned immediately, but `POST /auth/login` will be rejected with code ' +
      'EMAIL_NOT_VERIFIED until `POST /auth/verify-email` is completed.',
  })
  @ApiResponse({ status: 201, description: 'Account created; verification email sent' })
  @ApiResponse({ status: 400, description: 'Weak password or invalid payload' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 200, description: 'Authenticated successfully' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({
    status: 403,
    description: 'Account locked, suspended, or unverified (EMAIL_NOT_VERIFIED)',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a new access/refresh token pair' })
  @ApiResponse({ status: 200, description: 'New token pair issued' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke a single refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an email address using the token from the verification email' })
  @ApiResponse({ status: 200, description: 'Email verified; account activated' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Post('resend-verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the email verification link' })
  @ApiResponse({
    status: 200,
    description: 'Always 200; an email is sent only if the account exists and is unverified',
  })
  resendVerify(@Body() dto: ResendVerifyDto) {
    return this.authService.resendVerify(dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset link by email' })
  @ApiResponse({
    status: 200,
    description: 'Always 200; an email is sent only if the account exists',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset the password using the token from the reset email' })
  @ApiResponse({ status: 200, description: 'Password reset; all existing sessions revoked' })
  @ApiResponse({ status: 400, description: 'Invalid/expired token or weak new password' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Post('oauth/google')
  @ApiOperation({
    summary: 'Sign in / register with Google',
    description: 'Requires phase3_oauth. Verifies the Google ID token. Unsigned tokens return 401.',
  })
  @ApiResponse({ status: 200, description: 'Authenticated; account created if it did not already exist' })
  @ApiResponse({ status: 401, description: 'Identity token invalid' })
  @ApiResponse({ status: 403, description: 'phase3_oauth is disabled' })
  oauthGoogle(@Body() dto: OAuthLoginDto) {
    return this.authService.oauthLogin(AuthProvider.GOOGLE, dto);
  }

  @Public()
  @Post('oauth/apple')
  @ApiOperation({
    summary: 'Sign in / register with Apple',
    description: 'Requires phase3_oauth. Verifies the Apple ID token. Unsigned tokens return 401.',
  })
  @ApiResponse({ status: 200, description: 'Authenticated; account created if it did not already exist' })
  @ApiResponse({ status: 401, description: 'Identity token invalid' })
  @ApiResponse({ status: 403, description: 'phase3_oauth is disabled' })
  oauthApple(@Body() dto: OAuthLoginDto) {
    return this.authService.oauthLogin(AuthProvider.APPLE, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  me(@Req() req: AuthedRequest) {
    return this.authService.me(req.user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('switch-role')
  @ApiOperation({
    summary: 'Switch the active role for the current account',
    description:
      'The requested role must already be assigned to the account (in `user.roles`); ' +
      'ADMIN can only be selected if the account already has the ADMIN role.',
  })
  @ApiResponse({ status: 200, description: 'Active role switched; new token pair issued' })
  @ApiResponse({ status: 403, description: 'Role is not assigned to this account' })
  switchRole(@Req() req: AuthedRequest, @Body() dto: SwitchRoleDto) {
    return this.authService.switchRole(req.user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke every refresh token for the current user (log out everywhere)' })
  @ApiResponse({ status: 200, description: 'All sessions revoked' })
  revokeAll(@Req() req: AuthedRequest) {
    return this.authService.revokeAll(req.user.id);
  }
}
