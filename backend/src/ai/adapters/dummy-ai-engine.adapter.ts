import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { AiEngineAdapter, AiGenerateRequest, AiGenerateResult } from './ai-engine.adapter';

@Injectable()
export class DummyAiEngineAdapter implements AiEngineAdapter {
  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const source = this.dummyGlbPath(request.itemCode);
    if (!source) {
      throw new Error('Sample catalog GLB is missing');
    }
    return {
      glb: readFileSync(source),
      providerRef: `dummy-glb-${request.itemCode.toLowerCase()}`,
    };
  }

  dummyGlbPath(itemCode: string): string | null {
    const name = `${itemCode.toLowerCase()}.glb`;
    const candidates = [
      join(process.cwd(), '..', 'app', 'assets', 'models', 'studio', name),
      join(process.cwd(), 'app', 'assets', 'models', 'studio', name),
      join(__dirname, '..', '..', '..', '..', 'app', 'assets', 'models', 'studio', name),
    ];
    return candidates.find((path) => existsSync(path)) ?? null;
  }
}
