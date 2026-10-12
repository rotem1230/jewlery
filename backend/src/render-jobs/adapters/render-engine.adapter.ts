export type RenderJobRequest = {
  renderJobId: string;
  designId: string;
  designVersionId: string;
  exportFormat: string | null;
  parameters: unknown;
  ownerUserId: string;
};

export type RenderJobResult = {
  providerRef: string;
  outputUploadId: string | null;
};

/** Boundary for pluggable 3D render providers (local stub today, real cloud renderer later). */
export interface RenderEngineAdapter {
  render(request: RenderJobRequest): Promise<RenderJobResult>;
}

export const RENDER_ENGINE_ADAPTER = Symbol('RENDER_ENGINE_ADAPTER');
