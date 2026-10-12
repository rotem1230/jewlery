import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DesignStatus, FeasibilityStatus } from '@prisma/client';
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateDesignDto {
  @ApiProperty({ description: 'ItemType id (RING|NECKLACE|BRACELET|EARRINGS)' })
  @IsUUID()
  itemTypeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Atelier region filter for jeweler discovery' })
  @IsOptional()
  @IsUUID()
  preferredRegionId?: string;

  @ApiPropertyOptional({ description: 'Design parameters JSON, validated against ItemTypeConfig.parametersSchema' })
  @IsOptional()
  parameters?: Record<string, unknown>;
}

export class QueryDesignsDto {
  @ApiPropertyOptional({ enum: DesignStatus })
  @IsOptional()
  @IsEnum(DesignStatus)
  status?: DesignStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  itemTypeId?: string;

  @ApiPropertyOptional({ enum: ['newest', 'oldest', 'updated', 'title'], default: 'newest' })
  @IsOptional()
  @IsString()
  sort?: 'newest' | 'oldest' | 'updated' | 'title';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}

export class UpdateDesignDto {
  @ApiProperty({ description: 'Current known version, used for optimistic concurrency' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  parameters?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jewelerNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  preferredRegionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  thumbnailUploadId?: string;
}

export class TransitionDesignDto {
  @ApiProperty({ enum: DesignStatus })
  @IsEnum(DesignStatus)
  toStatus!: DesignStatus;
}

export class LockDesignDto {
  @ApiProperty({ type: [String], description: 'Parameter paths to lock, e.g. ["size","metal"]' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  fields!: string[];

  @ApiProperty({ description: 'Must be true to confirm the (irreversible-by-designer) lock action' })
  @Equals(true)
  confirm!: boolean;
}

export class AdminFeasibilityDto {
  @ApiProperty({ enum: [FeasibilityStatus.APPROVED, FeasibilityStatus.REJECTED] })
  @IsEnum(FeasibilityStatus)
  status!: FeasibilityStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
