import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
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

  @ApiProperty({ enum: UserRole, isArray: true, example: [UserRole.DESIGNER] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsEnum(UserRole, { each: true })
  roles!: UserRole[];
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
}
