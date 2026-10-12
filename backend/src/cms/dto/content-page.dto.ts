import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentPageStatus } from '@prisma/client';
import {
  IsDefined,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateContentPageDto {
  @ApiProperty({ example: 'faq' })
  @IsString()
  @MinLength(1)
  slug!: string;

  @ApiPropertyOptional({ example: 'he', default: 'he' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: 'Structured content blocks (JSON)' })
  @IsDefined()
  body!: unknown;
}

export class UpdateContentPageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Structured content blocks (JSON)' })
  @IsOptional()
  body?: unknown;

  @ApiPropertyOptional({ enum: ContentPageStatus })
  @IsOptional()
  @IsEnum(ContentPageStatus)
  status?: ContentPageStatus;
}
