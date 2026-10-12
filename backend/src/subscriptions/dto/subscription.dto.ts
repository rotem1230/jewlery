import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

/** Largest amount a DECIMAL(12,2) column holds. */
const MAX_AMOUNT = 9_999_999_999.99;

export class QueryPlansDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class SubscribeDto {
  @ApiProperty({ description: 'PlanCatalog.code, e.g. JEWELER_ACTIVE' })
  @IsString()
  @MaxLength(64)
  planCode!: string;
}

export class PaymentWebhookDto {
  @ApiProperty({ description: 'Payment provider identifier, e.g. stripe|tranzila' })
  @IsString()
  @MaxLength(50)
  provider!: string;

  @ApiProperty({ description: 'Provider-side event id; used for idempotency' })
  @IsString()
  @MaxLength(200)
  providerEventId!: string;

  @ApiProperty({ description: 'Event type, e.g. invoice.paid|subscription.cancelled' })
  @IsString()
  @MaxLength(100)
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @ApiPropertyOptional({ description: 'checkout.completed: the checkout session that was paid' })
  @IsOptional()
  @IsUUID()
  checkoutId?: string;

  @ApiPropertyOptional({ description: 'invoice.paid: provider invoice id (one renewal per invoice)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  invoiceId?: string;

  @ApiPropertyOptional({ description: 'Amount actually paid' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  amount?: number;

  @ApiPropertyOptional({ description: 'ISO 4217 currency of the amount' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;

  @ApiProperty({ description: 'Raw provider payload' })
  @IsObject()
  payload!: Record<string, unknown>;
}
