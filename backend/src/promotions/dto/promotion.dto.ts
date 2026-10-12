import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PromotionEntityType, PromotionSource } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class QueryPromotionsFeedDto {
  @ApiProperty({ example: 'atelier_banner', description: 'Placement slot, e.g. atelier_banner|recommendations_top' })
  @IsString()
  @MinLength(1)
  placement!: string;
}

export class CreatePromotionDto {
  @ApiProperty({ enum: PromotionEntityType })
  @IsEnum(PromotionEntityType)
  entityType!: PromotionEntityType;

  @ApiProperty({ description: 'Id of the Design/JewelerProfile/banner asset being promoted' })
  @IsUUID()
  entityId!: string;

  @ApiProperty({ example: 'atelier_banner', description: 'Placement slot, e.g. atelier_banner|recommendations_top' })
  @IsString()
  @MinLength(1)
  placement!: string;

  @ApiProperty({ enum: PromotionSource })
  @IsEnum(PromotionSource)
  source!: PromotionSource;

  @ApiPropertyOptional({ default: 0, description: 'Higher priority ranks first among sponsored slots' })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  budget?: number;

  @ApiProperty({ description: 'ISO datetime the promotion becomes active' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ description: 'ISO datetime the promotion expires' })
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Display metadata: headline, cta, imageUploadId, etc.' })
  @IsOptional()
  meta?: unknown;
}

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {}
