import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../authorization/decorators/public.decorator';
import { AppConfigService } from './app-config.service';

@ApiTags('Config')
@Controller('config')
export class ConfigController {
  constructor(private readonly appConfig: AppConfigService) {}

  @Public()
  @Get('public')
  getPublicConfig() {
    return this.appConfig.getPublicConfig();
  }
}
