import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class JewelerBusinessHourDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0=Sunday .. 6=Saturday' })
  @IsInt()
  day!: number;

  @ApiProperty({ example: '09:00' })
  @IsString()
  open!: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  close!: string;
}

/** Free-form draft payload; mirrors the eventual JewelerProfile columns. */
export class JewelerDraftPayloadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'E.164 phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ type: [JewelerBusinessHourDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JewelerBusinessHourDto)
  businessHours?: JewelerBusinessHourDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceAreaText?: string;

  @ApiPropertyOptional({ description: 'Workshop latitude (WGS84)' })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Workshop longitude (WGS84)' })
  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

export class UpsertJewelerDraftDto {
  @ApiProperty({ type: JewelerDraftPayloadDto })
  @ValidateNested()
  @Type(() => JewelerDraftPayloadDto)
  payload!: JewelerDraftPayloadDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  logoUploadId?: string;
}

export class CreatePortfolioItemDto {
  @ApiProperty()
  @IsUUID()
  uploadId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isSelectedWork?: boolean;
}

export class UpdatePortfolioItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSelectedWork?: boolean;
}

export type OrdersTab = 'all' | 'quote_submitted' | 'negotiating' | 'completed';

export class QueryOrdersDto {
  @ApiPropertyOptional({ enum: ['all', 'quote_submitted', 'negotiating', 'completed'], default: 'all' })
  @IsOptional()
  @IsString()
  tab?: OrdersTab;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}

export class AdminVerifyBadgeDto {
  @ApiProperty()
  @IsBoolean()
  verified!: boolean;
}

/** Requires the `jeweler_crm` entitlement (PRD §5.8 internal production-tracking CRM). */
export class CreateCrmNoteDto {
  @ApiPropertyOptional({ description: 'Associated design request, if any' })
  @IsOptional()
  @IsUUID()
  designRequestId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional({ example: 'IN_PRODUCTION', description: 'RECEIVED|IN_PRODUCTION|READY|SHIPPED|DONE' })
  @IsOptional()
  @IsString()
  productionStatus?: string;
}

export class UpdateCrmNoteDto extends PartialType(CreateCrmNoteDto) {}
