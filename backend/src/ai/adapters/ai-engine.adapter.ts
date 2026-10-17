export type AiGenerateRequest = {
  prompt: string;
  itemCode: string;
  /** The designer's inspiration picture: when present the model is made from it (image to 3D). */
  image?: { bytes: Buffer; mimeType: string };
};

export type AiGenerateResult = {
  glb: Buffer;
  providerRef: string;
};

/** Boundary for text / image to 3D providers (Tripo). */
export interface AiEngineAdapter {
  /** Whether a provider is configured; without one generation is refused up front. */
  isConfigured(): boolean;
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
}

export const AI_ENGINE_ADAPTER = Symbol('AI_ENGINE_ADAPTER');
