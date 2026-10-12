import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePresignDto {
  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MinLength(1)
  mimeType!: string;

  @ApiProperty({ example: 204800 })
  @IsInt()
  @IsPositive()
  sizeBytes!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  checksumSha256?: string;

  @ApiPropertyOptional({ description: 'Original filename, used to derive the object key' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;
}

export class ConfirmUploadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  checksumSha256?: string;
}
