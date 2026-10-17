import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { UploadsModule } from '../uploads/uploads.module';
import { RENDER_ENGINE_ADAPTER } from './adapters/render-engine.adapter';
import { JewelryModule } from '../jewelry/jewelry.module';
import { ParametricRenderEngineAdapter } from './adapters/parametric-render-engine.adapter';
import { RenderJobsController } from './render-jobs.controller';
import { RenderJobsService } from './render-jobs.service';

@Module({
  imports: [EntitlementsModule, UploadsModule, CmsModule, JewelryModule],
  controllers: [RenderJobsController],
  providers: [RenderJobsService, { provide: RENDER_ENGINE_ADAPTER, useClass: ParametricRenderEngineAdapter }],
  exports: [RenderJobsService],
})
export class RenderJobsModule {}
