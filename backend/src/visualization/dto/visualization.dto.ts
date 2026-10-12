import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateVisualizationJobDto {
  @ApiProperty({ description: 'Design the visualization is for' })
  @IsUUID()
  designId!: string;

  @ApiProperty({ description: 'Upload id of the personal photo to visualize the design on' })
  @IsUUID()
  inputUploadId!: string;
}

export class QueryVisualizationJobsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}
