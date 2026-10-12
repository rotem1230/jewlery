import { Injectable } from '@nestjs/common';
import { RenderEngineAdapter, RenderJobRequest, RenderJobResult } from './render-engine.adapter';

/** Mock render provider: no real 3D engine call, returns a fake provider ref synchronously. */
@Injectable()
export class StubRenderEngineAdapter implements RenderEngineAdapter {
  async render(request: RenderJobRequest): Promise<RenderJobResult> {
    return {
      providerRef: `stub-render-${request.renderJobId}`,
      outputUploadId: null,
    };
  }
}
