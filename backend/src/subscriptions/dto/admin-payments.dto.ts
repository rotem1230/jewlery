import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class RefundDto {
  @ApiPropertyOptional({ description: 'Amount to refund; the whole remaining amount when omitted' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiProperty({ description: 'Why the money is returned (kept with the refund)' })
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  reason!: string;

  @ApiPropertyOptional({ description: 'An id the admin screen makes for this refund: sent again, it answers the same refund' })
  @IsOptional()
  @IsUUID()
  requestId?: string;

  @ApiPropertyOptional({ description: 'End the plan now (a plan refunded in full usually should not continue)' })
  @IsOptional()
  @IsBoolean()
  endSubscription?: boolean;
}

export class ResolveRefundDto {
  @ApiProperty({ enum: ['SUCCEEDED', 'FAILED'], description: 'What the Cardcom panel shows for this refund' })
  @IsIn(['SUCCEEDED', 'FAILED'])
  outcome!: 'SUCCEEDED' | 'FAILED';
}

export class PaymentsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'From this time (inclusive)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'Until this time (exclusive)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
