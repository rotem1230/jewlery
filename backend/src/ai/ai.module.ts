import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AI_ENGINE_ADAPTER } from './adapters/ai-engine.adapter';
import { GeminiImageAiEngineAdapter } from './adapters/gemini-image-ai-engine.adapter';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [UploadsModule, CmsModule],
  controllers: [AiController],
  providers: [
    AiService,
    { provide: AI_ENGINE_ADAPTER, useClass: GeminiImageAiEngineAdapter },
  ],
  exports: [AiService],
})
export class AiModule {}
