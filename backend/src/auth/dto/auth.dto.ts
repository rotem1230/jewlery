import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const MAX_EMAIL = 254;
const MAX_PASSWORD = 128;
const MAX_NAME = 100;
const MAX_TOKEN = 512;

export class RegisterDto {
  @ApiProperty({ example: 'designer@example.com' })
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;

  @ApiProperty({ minLength: 8, example: 'Designer123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(MAX_PASSWORD)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME)
  lastName?: string;

  @ApiPropertyOptional({ description: 'E.164 phone number', example: '+972501234567' })
  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be an E.164 number' })
  phone?: string;

  @ApiProperty({ enum: UserRole, isArray: true, example: [UserRole.DESIGNER] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsEnum(UserRole, { each: true })
  roles!: UserRole[];

  @ApiPropertyOptional({ description: 'The terms box: false refuses the account; older apps (which required the box) send nothing' })
  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;

  @ApiPropertyOptional({ description: 'The version of the terms (CMS page "tos") shown on the screen' })
  @IsOptional()
  @IsInt()
  @Min(1)
  termsVersion?: number;

  @ApiPropertyOptional({ description: 'The separate, optional box for marketing messages (off unless ticked)' })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PASSWORD)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MaxLength(MAX_TOKEN)
  refreshToken!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Raw verification token from the emailed link' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TOKEN)
  token!: string;
}

export class ResendVerifyDto {
  @ApiProperty({ example: 'designer@example.com' })
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'designer@example.com' })
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Raw reset token from the emailed link' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TOKEN)
  token!: string;

  @ApiProperty({ minLength: 8, example: 'NewPassw0rd!' })
  @IsString()
  @MinLength(8)
  @MaxLength(MAX_PASSWORD)
  newPassword!: string;
}

/** A role a user can take on themselves (PRD 5.1); ADMIN is never self-assigned. */
export class AddRoleDto {
  @ApiProperty({ enum: [UserRole.DESIGNER, UserRole.JEWELER], example: UserRole.JEWELER })
  @IsIn([UserRole.DESIGNER, UserRole.JEWELER])
  role!: typeof UserRole.DESIGNER | typeof UserRole.JEWELER;
}

export class SwitchRoleDto {
  @ApiProperty({ enum: UserRole, example: UserRole.JEWELER })
  @IsEnum(UserRole)
  role!: UserRole;
}

/** Google/Apple ID token, verified server-side against the provider's published keys. */
export class OAuthLoginDto {
  @ApiProperty({ description: 'Provider ID token (JWT, RS256).' })
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  idToken!: string;

  @ApiPropertyOptional({
    description: 'Ignored. Kept for client compatibility: the e-mail is taken only from a verified ID token.',
    deprecated: true,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(MAX_EMAIL)
  email?: string;

  @ApiPropertyOptional({ description: 'Display name fallback when the token carries none.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Display name fallback when the token carries none.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME)
  lastName?: string;

  @ApiPropertyOptional({ description: 'The terms box: a new account is created only when true (TERMS_REQUIRED otherwise)' })
  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;

  @ApiPropertyOptional({ description: 'The version of the terms (CMS page "tos") shown on the screen' })
  @IsOptional()
  @IsInt()
  @Min(1)
  termsVersion?: number;

  @ApiPropertyOptional({ description: 'The separate, optional box for marketing messages (off unless ticked)' })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}
