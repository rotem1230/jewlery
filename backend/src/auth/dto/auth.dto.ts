import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'designer@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'Designer123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ enum: UserRole, isArray: true, example: [UserRole.DESIGNER] })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(UserRole, { each: true })
  roles!: UserRole[];
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Raw verification token from the emailed link' })
  @IsString()
  @MinLength(1)
  token!: string;
}

export class ResendVerifyDto {
  @ApiProperty({ example: 'designer@example.com' })
  @IsEmail()
  email!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'designer@example.com' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Raw reset token from the emailed link' })
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty({ minLength: 8, example: 'NewPassw0rd!' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class SwitchRoleDto {
  @ApiProperty({ enum: UserRole, example: UserRole.JEWELER })
  @IsEnum(UserRole)
  role!: UserRole;
}

/** Google/Apple ID token. Verified server-side when `phase3_oauth` is enabled. */
export class OAuthLoginDto {
  @ApiProperty({ description: 'Provider ID token (JWT). Unsigned tokens are rejected.' })
  @IsString()
  @MinLength(1)
  idToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;
}
