import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';

/** Where the designer put the piece on the photo (see jewelry/compose.ts Placement). */
export class TryOnPlacementDto {
  @ApiProperty({ description: 'Centre, fraction of the photo width (0–1)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  x!: number;

  @ApiProperty({ description: 'Centre, fraction of the photo height (0–1)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  y!: number;

  @ApiProperty({ description: 'Overlay width as a fraction of the photo width' })
  @IsNumber()
  @Min(0.03)
  @Max(1.5)
  scale!: number;

  @ApiProperty({ description: 'Clockwise rotation in degrees' })
  @IsNumber()
  @Min(-360)
  @Max(360)
  rotation!: number;
}

export class CreateVisualizationJobDto {
  @ApiProperty({ description: 'Design the visualization is for' })
  @IsUUID()
  designId!: string;

  @ApiProperty({ description: 'Upload id of the personal photo to visualize the design on' })
  @IsUUID()
  inputUploadId!: string;

  @ApiPropertyOptional({ type: TryOnPlacementDto, description: 'Where to put the piece; centred when omitted' })
  @IsOptional()
  @ValidateNested()
  @Type(() => TryOnPlacementDto)
  placement?: TryOnPlacementDto;
}

export class QueryVisualizationJobsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}
