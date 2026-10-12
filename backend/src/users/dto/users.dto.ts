import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'E.164 phone number' })
  @IsOptional()
  @IsString()
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
  locale?: string;

  @ApiPropertyOptional({ description: 'US|EU|UK|IL' })
  @IsOptional()
  @IsString()
  preferredSizeStandard?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  appVersion?: string;
}
