import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JewelryRenderService } from '../../jewelry/jewelry-render.service';
import { UploadsService } from '../../uploads/uploads.service';
import { RenderEngineAdapter, RenderJobRequest, RenderJobResult } from './render-engine.adapter';

/** Picture size of an HD export (pixels per side; rendered with 2×2 supersampling). */
export const HD_PICTURE_SIZE = 1600;

/**
 * Builds the export from the design's parameters with the shared parametric geometry: an STL or
 * OBJ mesh in millimetres for manufacturing, or a rendered HD picture of the same piece.
 */
@Injectable()
export class ParametricRenderEngineAdapter implements RenderEngineAdapter {
  constructor(
    private readonly jewelry: JewelryRenderService,
    private readonly uploads: UploadsService,
  ) {}

  async render(request: RenderJobRequest): Promise<RenderJobResult> {
    const design = {
      id: request.designId,
      itemTypeId: request.itemTypeId,
      parameters: request.parameters as Prisma.JsonValue,
      version: request.designVersion,
    };
    const format = request.exportFormat ?? 'STL';
    if (format === 'PNG_HD') {
      const png = await this.jewelry.picture(design, {
        size: HD_PICTURE_SIZE,
        supersample: 2,
        background: 'studio',
        watermark: request.applyWatermark,
      });
      const upload = await this.uploads.createGeneratedLocal(request.ownerUserId, png, 'image/png');
      return { providerRef: `parametric-png-${request.renderJobId}`, outputUploadId: upload.id };
    }
    if (format === 'OBJ') {
      const obj = await this.jewelry.obj(design);
      const upload = await this.uploads.createGeneratedLocal(request.ownerUserId, obj, 'model/obj');
      return { providerRef: `parametric-obj-${request.renderJobId}`, outputUploadId: upload.id };
    }
    if (format !== 'STL') {
      throw new Error(`Unsupported export format ${format}`);
    }
    const stl = await this.jewelry.stl(design);
    const upload = await this.uploads.createGeneratedLocal(request.ownerUserId, stl, 'model/stl');
    return { providerRef: `parametric-stl-${request.renderJobId}`, outputUploadId: upload.id };
  }
}
