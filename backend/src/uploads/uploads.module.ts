import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { jwtModuleOptions } from '../auth/jwt-options';
import { CmsModule } from '../cms/cms.module';
import { UploadAccessService } from './upload-access.service';
import { UploadsController } from './uploads.controller';
import { MediaTrafficService } from './media-traffic.service';
import { UploadsService } from './uploads.service';

@Module({
  imports: [
    CmsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: jwtModuleOptions,
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService, UploadAccessService, MediaTrafficService],
  exports: [UploadsService, UploadAccessService],
})
export class UploadsModule {}
