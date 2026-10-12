import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateItemTypeDto {
  @ApiProperty({ example: 'RING' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  labelHe!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  labelEn?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateItemTypeDto extends PartialType(CreateItemTypeDto) {}

export class CreateMetalDto {
  @ApiProperty({ example: 'YELLOW_GOLD' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  labelHe!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  labelEn?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  priceModifier?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateMetalDto extends PartialType(CreateMetalDto) {}

export class CreateMetalPurityDto {
  @ApiProperty({ example: '14K' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  labelHe?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateMetalPurityDto extends PartialType(CreateMetalPurityDto) {}

export class CreateSettingDto {
  @ApiProperty({ example: '6_PRONG' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  labelHe!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  labelEn?: string;

  @ApiPropertyOptional({ description: 'Minimum band width (mm) this setting requires' })
  @IsOptional()
  @IsNumber()
  minBandWidthMm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  imageUploadId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Item type IDs this setting is available for', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(50)
  itemTypeIds?: string[];
}

export class UpdateSettingDto extends PartialType(CreateSettingDto) {}

export class CreateStoneDto {
  @ApiProperty({ example: 'DIAMOND' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  nameHe!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  imageUploadId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStoneDto extends PartialType(CreateStoneDto) {}

export class CreateStoneOptionDto {
  @ApiProperty({ example: 'SHAPE', description: 'SHAPE|COLOR|CLARITY|SIZE_MM|WEIGHT_CT' })
  @IsString()
  @MinLength(1)
  kind!: string;

  @ApiProperty({ example: 'ROUND' })
  @IsString()
  @MinLength(1)
  value!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  labelHe?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStoneOptionDto extends PartialType(CreateStoneOptionDto) {}

export class CreateFinishTypeDto {
  @ApiProperty({ example: 'POLISHED' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  labelHe!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  labelEn?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateFinishTypeDto extends PartialType(CreateFinishTypeDto) {}

export class CreateElementDto {
  @ApiProperty({ example: 'HEART_CHARM' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  labelHe!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  labelEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  imageUploadId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateElementDto extends PartialType(CreateElementDto) {}

export class CreateRegionDto {
  @ApiProperty({ example: 'TEL_AVIV' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  labelHe!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  labelEn?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRegionDto extends PartialType(CreateRegionDto) {}

export class CreateSizeChartDto {
  @ApiProperty()
  @IsUUID()
  itemTypeId!: string;

  @ApiProperty({ example: 'US' })
  @IsString()
  @MinLength(1)
  standard!: string;

  @ApiProperty({ example: '6.00' })
  @IsString()
  @MinLength(1)
  sizeCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  diameterMinMm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  diameterMaxMm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lengthCm?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSizeChartDto extends PartialType(CreateSizeChartDto) {}

export class CreateMeasurementGuideDto {
  @ApiProperty()
  @IsUUID()
  itemTypeId!: string;

  @ApiPropertyOptional({ default: 'he' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ description: 'Structured body (tips + tables), JSON' })
  @IsDefined()
  body!: unknown;
}

export class UpdateMeasurementGuideDto extends PartialType(CreateMeasurementGuideDto) {}

export class EtlImportDto {
  @ApiProperty({
    example: 'metals',
    description: 'itemTypes|metals|settings|stones|finishTypes|elements|regions',
  })
  @IsString()
  @MinLength(1)
  entity!: string;

  @ApiProperty({ type: [Object], description: 'Rows to upsert by `code`' })
  @IsArray()
  @ArrayMaxSize(500)
  rows!: Record<string, unknown>[];
}
