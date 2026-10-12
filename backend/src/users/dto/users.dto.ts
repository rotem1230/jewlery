import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ description: 'E.164 phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ description: 'Upload id of a ready image owned by the current user' })
  @IsOptional()
  @IsUUID()
  avatarUploadId?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ minLength: 8, example: 'NewPassw0rd!' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ example: 'he' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  @ApiPropertyOptional({ description: 'US|EU|UK|IL' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  preferredSizeStandard?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  preferredRingSizeCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyPushEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyEmailEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyChatEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyMarketingEnabled?: boolean;
}

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Push notification device token' })
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty({ example: 'ios', description: 'ios|android' })
  @IsString()
  @MinLength(1)
  platform!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;
}
