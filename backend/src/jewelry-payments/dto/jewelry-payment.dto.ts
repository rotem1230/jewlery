import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * The client names WHAT it pays for, never HOW MUCH: amount and currency are taken from the
 * accepted quote on the server.
 */
export class CreatePaymentIntentDto {
  @ApiProperty({ description: 'Accepted quote this payment settles' })
  @IsUUID()
  quoteId!: string;
}
