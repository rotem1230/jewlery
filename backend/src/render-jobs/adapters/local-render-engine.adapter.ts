import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { RenderEngineAdapter, RenderJobRequest, RenderJobResult } from './render-engine.adapter';
import { UploadsService } from '../../uploads/uploads.service';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const TINY_STL = Buffer.from(
  'solid mailnvosky\n  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n      vertex 1 0 0\n      vertex 0 1 0\n    endloop\n  endfacet\nendsolid mailnvosky\n',
);

/** Writes a real PNG or STL into Uploads. Optional RENDER_ENGINE_URL is reserved for a later HTTP engine. */
@Injectable()
export class LocalRenderEngineAdapter implements RenderEngineAdapter {
  constructor(private readonly uploads: UploadsService) {}

  async render(request: RenderJobRequest & { ownerUserId?: string }): Promise<RenderJobResult> {
    const ownerUserId = request.ownerUserId;
    if (!ownerUserId) {
      return { providerRef: `local-render-${request.renderJobId}`, outputUploadId: null };
    }

    if (request.exportFormat === 'PNG_HD') {
      const png = this.readShowcasePng() ?? TINY_PNG;
      const upload = await this.uploads.createGeneratedLocal(ownerUserId, png, 'image/png');
      return { providerRef: `local-png-${request.renderJobId}`, outputUploadId: upload.id };
    }

    const upload = await this.uploads.createGeneratedLocal(ownerUserId, TINY_STL, 'model/stl');
    return { providerRef: `local-stl-${request.renderJobId}`, outputUploadId: upload.id };
  }

  private readShowcasePng(): Buffer | null {
    const path = join(process.cwd(), 'seed-assets/showcase/work-ring.png');
    return existsSync(path) ? readFileSync(path) : null;
  }
}
