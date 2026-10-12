export type AiGenerateRequest = {
  prompt: string;
  itemCode: string;
};

export type AiGenerateResult = {
  glb: Buffer;
  providerRef: string;
};

/** Boundary for text-to-GLB providers (dummy catalog copy today, Tripo when keyed). */
export interface AiEngineAdapter {
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
}

export const AI_ENGINE_ADAPTER = Symbol('AI_ENGINE_ADAPTER');
