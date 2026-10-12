import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { ApiFieldError } from '../common/dto/api-response.dto';
import { AllExceptionsFilter, HttpExceptionFilter } from '../common/filters/all-exceptions.filter';

/**
 * Global HTTP pipeline shared by main.ts and the e2e test harness, so tests exercise exactly
 * the production configuration (prefix, parsers, helmet, CORS, validation, error shape).
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>('apiPrefix', 'api/v1');
  const corsOrigins = config.get<string[]>('corsOrigins', []);
  const bodyLimit = config.get<number>('bodySizeLimit', 1_048_576);

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
}
