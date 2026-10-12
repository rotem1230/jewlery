import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Matches the Decimal(12, 2) columns. */
export const MAX_AMOUNT = 9_999_999_999.99;
const CURRENCY = /^[A-Z]{3}$/;
const upperCase = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const MAX_NOTES = 2000;

export class CreateQuoteDto {
  @ApiProperty({ description: 'Conversation this quote is posted into' })
  @IsUUID()
  conversationId!: string;

  @ApiProperty({ description: 'Must match the conversation design' })
  @IsUUID()
  designId!: string;

  @ApiPropertyOptional({ description: 'Linked design request (must target the quoting jeweler)' })
  @IsOptional()
  @IsUUID()
  designRequestId?: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  materialsCost!: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  laborCost!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999)
  laborHours?: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(3650)
  etaBusinessDays!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES)
  notes?: string;

  @ApiPropertyOptional({ description: 'ISO date the quote expires' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ default: 'ILS', description: 'ISO 4217 code; stored upper-case' })
  @IsOptional()
  @Transform(upperCase)
  @IsString()
  @Matches(CURRENCY, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency?: string;
}

export class UpdateQuoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  materialsCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  laborCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999)
  laborHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  etaBusinessDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ description: 'ISO 4217 code; stored upper-case' })
  @IsOptional()
  @Transform(upperCase)
  @IsString()
  @Matches(CURRENCY, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency?: string;
}

/**
 * The owner confirms the exact terms shown on the quote card. If the quote no longer has this
 * price and currency when the accept is applied, it is refused with 409 QUOTE_CHANGED.
 */
export class AcceptQuoteDto {
  @ApiProperty({ description: 'Total price shown to the owner' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  expectedTotalPrice!: number;

  @ApiProperty({ description: 'Currency shown to the owner (ISO 4217)', example: 'ILS' })
  @Transform(upperCase)
  @IsString()
  @Matches(CURRENCY, { message: 'expectedCurrency must be a 3-letter ISO 4217 code' })
  expectedCurrency!: string;
}

export class DeclineQuoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES)
  note?: string;
}
