import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateAiInspirationDto {
  @ApiPropertyOptional({ description: 'Design id to associate the generated inspiration with' })
  @IsOptional()
  @IsUUID()
  designId?: string;

  @ApiProperty({ description: 'Natural-language prompt describing the desired inspiration image' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  prompt!: string;
}
