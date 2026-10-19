import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const CYCLES = ['MONTHLY', 'QUARTERLY', 'ANNUAL'];

/** The fields of a plan an admin sets (all optional on an update). */
export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nameHe?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameEn?: string;

  @ApiPropertyOptional({ enum: CYCLES })
  @IsOptional()
  @IsIn(CYCLES)
  billingCycle?: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

  @ApiPropertyOptional({ description: 'Price in ILS; existing subscriptions keep the price they agreed to' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  trialDays?: number;

  @ApiPropertyOptional({ description: 'Leads per billing period (jewelers)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  leadQuota?: number;

  @ApiPropertyOptional({ description: 'Price of a lead beyond the quota; null = none (delivery stops)' })
  @IsOptional()
  @ValidateIf((dto: UpdatePlanDto) => dto.extraLeadPrice !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  extraLeadPrice?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Offered to new subscribers' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'What the plan includes, in Hebrew (shown on the plan card)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  bulletsHe?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  bulletsEn?: string[];

  @ApiPropertyOptional({ description: 'Feature keys the plan unlocks (GET /admin/plans/features)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ description: 'AI creations included per billing period; null = the free plan\'s' })
  @IsOptional()
  @ValidateIf((dto: UpdatePlanDto) => dto.aiRenders !== null)
  @IsInt()
  @Min(0)
  @Max(100_000)
  aiRenders?: number | null;

  @ApiPropertyOptional({ description: 'Shown as "unlimited (fair use)": its caps are not advertised' })
  @IsOptional()
  @IsBoolean()
  unlimited?: boolean;
}

export class CreatePlanDto extends UpdatePlanDto {
  @ApiProperty({ description: 'Unique code, e.g. DESIGNER_PREMIUM_MONTHLY' })
  @Matches(/^[A-Z][A-Z0-9_]{2,49}$/, { message: 'code must be capital letters, digits and _ (3 to 50)' })
  code!: string;

  @ApiProperty({ enum: ['DESIGNER', 'JEWELER'] })
  @IsIn(['DESIGNER', 'JEWELER'])
  role!: 'DESIGNER' | 'JEWELER';

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  declare nameHe: string;

  @ApiProperty({ enum: CYCLES })
  @IsIn(CYCLES)
  declare billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  declare price: number;
}
