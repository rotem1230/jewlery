import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty()
  @IsUUID()
  jewelerProfileId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  reviewerName!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  comment!: string;
}

export class QueryReviewsDto {
  @ApiProperty()
  @IsUUID()
  jewelerProfileId!: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}

export class FeatureReviewDto {
  @ApiProperty()
  @IsBoolean()
  isFeatured!: boolean;
}
