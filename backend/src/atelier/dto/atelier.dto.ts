import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { DesignRequestMode } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class QueryAtelierDesignsDto {
  @ApiPropertyOptional({ description: 'Free-text search on title/description' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Region id filter (Design.preferredRegionId)' })
  @IsOptional()
  @IsUUID()
  regionId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}

export class QueryAtelierJewelersDto {
  @ApiPropertyOptional({ description: 'Free-text search on business name/bio/specialties' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  regionId?: string;

  @ApiPropertyOptional({ enum: ['rating', 'newest'], default: 'rating' })
  @IsOptional()
  @IsString()
  sort?: 'rating' | 'newest';

  @ApiPropertyOptional({
    type: String,
    description:
      'Comma-separated specialty codes used only for Phase 2 matchScore ranking (behind phase2_matching); does not filter results.',
    example: 'ENGAGEMENT_RINGS,CUSTOM_NECKLACES',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value))
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}

export class GeoSearchDto {
  @ApiProperty({ description: 'Latitude of the search center' })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ description: 'Longitude of the search center' })
  @IsLongitude()
  lng!: number;

  @ApiProperty({ description: 'Search radius in kilometers (rounded up to whole km, at least 1)' })
  @IsNumber()
  @Min(0)
  @Max(500)
  radiusKm!: number;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}

export class CreateAtelierRequestDto {
  @ApiProperty()
  @IsUUID()
  designId!: string;

  @ApiProperty({ enum: DesignRequestMode })
  @IsEnum(DesignRequestMode)
  mode!: DesignRequestMode;

  @ApiPropertyOptional({ type: [String], description: 'Required when mode=TARGETED' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  targetJewelerProfileIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;
}
