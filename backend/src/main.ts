import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';
import { setupSwagger } from './swagger/swagger.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const port = config.get<number>('port', 3000);
  const apiPrefix = config.get<string>('apiPrefix', 'api/v1');
  const isProduction = config.get<string>('nodeEnv') === 'production';

  configureApp(app);

  if (!isProduction) {
    setupSwagger(app, apiPrefix);
  }

  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/${apiPrefix}`);
  if (!isProduction) {
    logger.log(`Swagger at http://localhost:${port}/${apiPrefix}/docs`);
  }
}

bootstrap();
