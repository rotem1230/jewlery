import { ApiProperty } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';

export class UpsertAppConfigDto {
  @ApiProperty({ description: 'Arbitrary JSON value for this config key' })
  @IsDefined()
  value!: unknown;
}
