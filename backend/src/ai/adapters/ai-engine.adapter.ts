export type AiGenerateRequest = {
  prompt: string;
  itemCode: string;
  /** The designer's inspiration picture: when present the new picture is made from it. */
  image?: { bytes: Buffer; mimeType: string };
};

export type AiGenerateResult = {
  /** The generated inspiration picture. */
  image: Buffer;
  mimeType: string;
  providerRef: string;
};

/** Boundary for the image-generation provider of the inspiration step (PRD 5.4 step 7). */
export interface AiEngineAdapter {
  /** Whether a provider is configured; without one generation is refused up front. */
  isConfigured(): boolean;
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
}

export const AI_ENGINE_ADAPTER = Symbol('AI_ENGINE_ADAPTER');
