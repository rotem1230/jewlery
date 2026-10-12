import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum RenderExportFormat {
  STL = 'STL',
  OBJ = 'OBJ',
  STEP = 'STEP',
  PNG_HD = 'PNG_HD',
}

export class CreateRenderJobDto {
  @ApiProperty({ description: 'Design id to render' })
  @IsUUID()
  designId!: string;

  @ApiPropertyOptional({ enum: RenderExportFormat })
  @IsOptional()
  @IsEnum(RenderExportFormat)
  exportFormat?: RenderExportFormat;
}
