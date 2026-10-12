import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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
  @MaxLength(5)
  open!: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  @MaxLength(5)
  close!: string;
}

/** Free-form draft payload; mirrors the eventual JewelerProfile columns. */
export class JewelerDraftPayloadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessName?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @MaxLength(50, { each: true })
  specialties?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ description: 'E.164 phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ type: [JewelerBusinessHourDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JewelerBusinessHourDto)
  @ArrayMaxSize(14)
  businessHours?: JewelerBusinessHourDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
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
  @MaxLength(200)
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
  @MaxLength(200)
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
  @MaxLength(50)
  productionStatus?: string;
}

export class UpdateCrmNoteDto extends PartialType(CreateCrmNoteDto) {}
