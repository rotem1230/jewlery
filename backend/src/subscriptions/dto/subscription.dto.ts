import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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

  @ApiProperty({ description: 'Raw provider payload' })
  @IsObject()
  payload!: Record<string, unknown>;
}
