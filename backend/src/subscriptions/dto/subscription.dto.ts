import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class QueryPlansDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class SubscribeDto {
  @ApiProperty({ description: 'PlanCatalog.code, e.g. JEWELER_ACTIVE' })
  @IsString()
  planCode!: string;
}

export class PaymentWebhookDto {
  @ApiProperty({ description: 'Payment provider identifier, e.g. stripe|tranzila' })
  @IsString()
  provider!: string;

  @ApiProperty({ description: 'Provider-side event id; used for idempotency' })
  @IsString()
  providerEventId!: string;

  @ApiProperty({ description: 'Event type, e.g. invoice.paid|subscription.cancelled' })
  @IsString()
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subscriptionId?: string;

  @ApiProperty({ description: 'Raw provider payload' })
  @IsObject()
  payload!: Record<string, unknown>;
}
