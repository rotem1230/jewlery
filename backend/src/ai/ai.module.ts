import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AI_ENGINE_ADAPTER } from './adapters/ai-engine.adapter';
import { TripoAiEngineAdapter } from './adapters/tripo-ai-engine.adapter';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [UploadsModule, CmsModule],
  controllers: [AiController],
  providers: [
    AiService,
    { provide: AI_ENGINE_ADAPTER, useClass: TripoAiEngineAdapter },
  ],
  exports: [AiService],
})
export class AiModule {}
