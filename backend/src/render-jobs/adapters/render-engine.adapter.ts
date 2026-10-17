export type RenderJobRequest = {
  renderJobId: string;
  designId: string;
  designVersionId: string;
  /** Design version the job was made for (written into exported file headers). */
  designVersion: number;
  itemTypeId: string;
  exportFormat: string | null;
  parameters: unknown;
  ownerUserId: string;
  /** Free-plan pictures carry the brand mark; plans with `no_watermark` do not. */
  applyWatermark: boolean;
};

export type RenderJobResult = {
  providerRef: string;
  outputUploadId: string | null;
};

/** Boundary for render providers: the parametric engine today, a cloud renderer could replace it. */
export interface RenderEngineAdapter {
  render(request: RenderJobRequest): Promise<RenderJobResult>;
}

export const RENDER_ENGINE_ADAPTER = Symbol('RENDER_ENGINE_ADAPTER');
