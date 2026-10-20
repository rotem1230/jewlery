import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Ip, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthProvider, User } from '@prisma/client';
import { Request } from 'express';
import { AllowUnverified } from '../authorization/decorators/allow-unverified.decorator';
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
  AddRoleDto,
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
      'No session is issued: sign in with `POST /auth/login` after the e-mail is verified.',
  })
  @ApiResponse({ status: 201, description: 'Account created; verification email sent' })
  @ApiResponse({ status: 400, description: 'Weak password or invalid payload' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({ status: 429, description: 'Too many requests from this client' })
  register(@Body() dto: RegisterDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.authService.register(dto, ip, userAgent);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 201, description: 'Authenticated successfully' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({
    status: 403,
    description: 'Account locked, or (correct password) suspended / unverified (EMAIL_NOT_VERIFIED)',
  })
  @ApiResponse({ status: 429, description: 'Too many attempts for this account from this client' })
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto, ip);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a new access/refresh token pair' })
  @ApiResponse({ status: 201, description: 'New token pair issued' })
  @ApiResponse({ status: 401, description: 'Invalid, expired or replayed refresh token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke a single refresh token' })
  @ApiResponse({ status: 201, description: 'Logged out' })
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
    description: 'Always 200; an email is sent only if the account exists, is unverified and under its hourly cap',
  })
  resendVerify(@Body() dto: ResendVerifyDto, @Ip() ip: string) {
    return this.authService.resendVerify(dto, ip);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset link by email' })
  @ApiResponse({
    status: 200,
    description: 'Always 200; an email is sent only if the account exists and is under its hourly cap',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Ip() ip: string) {
    return this.authService.forgotPassword(dto, ip);
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
    description: 'Requires phase3_oauth and GOOGLE_CLIENT_ID. The ID token is verified locally against Google keys.',
  })
  @ApiResponse({ status: 201, description: 'Authenticated; account created if it did not already exist' })
  @ApiResponse({ status: 401, description: 'Identity token invalid' })
  @ApiResponse({ status: 403, description: 'phase3_oauth is disabled' })
  @ApiResponse({ status: 503, description: 'Provider not configured on this server' })
  oauthGoogle(@Body() dto: OAuthLoginDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.authService.oauthLogin(AuthProvider.GOOGLE, dto, { ip, userAgent });
  }

  @Public()
  @Post('oauth/apple')
  @ApiOperation({
    summary: 'Sign in / register with Apple',
    description: 'Requires phase3_oauth and APPLE_CLIENT_ID. The ID token is verified locally against Apple keys.',
  })
  @ApiResponse({ status: 201, description: 'Authenticated; account created if it did not already exist' })
  @ApiResponse({ status: 401, description: 'Identity token invalid' })
  @ApiResponse({ status: 403, description: 'phase3_oauth is disabled' })
  @ApiResponse({ status: 503, description: 'Provider not configured on this server' })
  oauthApple(@Body() dto: OAuthLoginDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.authService.oauthLogin(AuthProvider.APPLE, dto, { ip, userAgent });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  me(@Req() req: AuthedRequest) {
    return this.authService.me(req.user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('roles')
  @ApiOperation({
    summary: 'Add the designer or jeweler role to the current account',
    description: 'The active role does not change; switch to the new role with switch-role. Adding a role the account has is a no-op.',
  })
  @ApiResponse({ status: 201, description: 'Role added; new token pair issued' })
  @ApiResponse({ status: 400, description: 'Only DESIGNER or JEWELER can be added' })
  addRole(@Req() req: AuthedRequest, @Body() dto: AddRoleDto) {
    return this.authService.addRole(req.user, dto);
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
  @ApiResponse({ status: 201, description: 'Active role switched; new token pair issued' })
  @ApiResponse({ status: 403, description: 'Role is not assigned to this account' })
  switchRole(@Req() req: AuthedRequest, @Body() dto: SwitchRoleDto) {
    return this.authService.switchRole(req.user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AllowUnverified()
  @Post('revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke every refresh token for the current user (log out everywhere)' })
  @ApiResponse({ status: 200, description: 'All sessions revoked' })
  revokeAll(@Req() req: AuthedRequest) {
    return this.authService.revokeAll(req.user.id);
  }
}
