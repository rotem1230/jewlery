import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export const SUBSCRIPTION_LIST_STATUSES = ['live', 'all', ...Object.values(SubscriptionStatus)] as const;
export type SubscriptionListStatus = (typeof SUBSCRIPTION_LIST_STATUSES)[number];

export class AdminSubscriptionsQueryDto {
  @ApiPropertyOptional({ enum: ['DESIGNER', 'JEWELER'] })
  @IsOptional()
  @IsIn(['DESIGNER', 'JEWELER'])
  role?: 'DESIGNER' | 'JEWELER';

  @ApiPropertyOptional({ enum: SUBSCRIPTION_LIST_STATUSES, description: 'live (default): trialing, active or past due; all: every plan' })
  @IsOptional()
  @IsIn(SUBSCRIPTION_LIST_STATUSES as unknown as string[])
  status?: SubscriptionListStatus;

  @ApiPropertyOptional({ description: 'Part of the e-mail address, phone number or name' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 30, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

class AdminActionDto {
  @ApiProperty({ description: 'Why (kept in the audit log)' })
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  reason!: string;

  @ApiPropertyOptional({ description: 'An id the admin screen makes for this action: sent again, it is not applied twice' })
  @IsOptional()
  @IsUUID()
  requestId?: string;
}

export class ExtendSubscriptionDto extends AdminActionDto {
  @ApiProperty({ minimum: 1, maximum: 365, description: 'Days added to the current period (and to a trial)' })
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;
}

export class AddLeadsDto extends AdminActionDto {
  @ApiProperty({ minimum: 1, maximum: 100, description: 'Leads added for the rest of the current period' })
  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;
}

export class AdminCancelSubscriptionDto extends AdminActionDto {
  @ApiProperty({ description: 'true: the plan ends now; false: it ends at the end of the period (nothing renews)' })
  @IsBoolean()
  immediately!: boolean;
}
