import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateQuoteDto {
  @ApiProperty({ description: 'Conversation this quote is posted into' })
  @IsUUID()
  conversationId!: string;

  @ApiProperty({ description: 'Must match the conversation design' })
  @IsUUID()
  designId!: string;

  @ApiPropertyOptional({ description: 'Linked design request, if this quote responds to one' })
  @IsOptional()
  @IsUUID()
  designRequestId?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  materialsCost!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  laborCost!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  laborHours?: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  etaBusinessDays!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  @IsNumber()
  @Min(0)
  materialsCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  laborCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  laborHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  etaBusinessDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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

export class DeclineQuoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
