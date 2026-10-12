import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  AllExceptionsFilter,
  HttpExceptionFilter,
} from './common/filters/all-exceptions.filter';
import { ApiFieldError } from './common/dto/api-response.dto';
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
  const corsOrigins = config.get<string[]>('corsOrigins', []);
  const bodyLimit = config.get<number>('bodySizeLimit', 1_048_576);
  const isProduction = config.get<string>('nodeEnv') === 'production';

  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  app.setGlobalPrefix(apiPrefix);
  app.use(helmet());
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) => {
        const fieldErrors: ApiFieldError[] = errors.flatMap((err) => {
          const messages = Object.values(err.constraints ?? {});
          return messages.map((message) => ({
            field: err.property,
            message,
          }));
        });
        return new BadRequestException({
          success: false,
          message: 'Validation failed',
          errors: fieldErrors,
        });
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());
  app.enableShutdownHooks();

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
