import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Matches the Decimal(12, 2) columns. */
const MAX_AMOUNT = 9_999_999_999.99;
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

  @ApiPropertyOptional({ default: 'ILS' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class AcceptQuoteDto {
  @ApiPropertyOptional({
    description: 'Total price the owner saw; if the quote now differs the accept is refused with 409 QUOTE_CHANGED',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedTotalPrice?: number;
}

export class DeclineQuoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES)
  note?: string;
}
