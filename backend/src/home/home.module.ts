import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [CmsModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
