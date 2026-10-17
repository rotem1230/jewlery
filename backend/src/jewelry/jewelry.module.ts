import { Module } from '@nestjs/common';
import { JewelryRenderService } from './jewelry-render.service';

/** Parametric jewelry geometry and the files made from it (STL, OBJ, rendered pictures). */
@Module({
  providers: [JewelryRenderService],
  exports: [JewelryRenderService],
})
export class JewelryModule {}
