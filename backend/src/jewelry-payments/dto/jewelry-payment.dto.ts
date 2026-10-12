import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length } from 'class-validator';

export class CreatePaymentIntentDto {
  @ApiProperty({ description: 'Amount in the smallest currency unit is not required; decimal amount, e.g. 1499.90' })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: 'ILS', description: 'ISO 4217 currency code' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiPropertyOptional({ description: 'Design this payment relates to, if any' })
  @IsOptional()
  @IsUUID()
  designId?: string;

  @ApiPropertyOptional({ description: 'Accepted quote this payment settles, if any' })
  @IsOptional()
  @IsUUID()
  quoteId?: string;
}
