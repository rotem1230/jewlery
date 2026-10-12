import { Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { ConfigController } from './config.controller';
import { ContentController } from './content.controller';

@Module({
  controllers: [ConfigController, ContentController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class CmsModule {}
