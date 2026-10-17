import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, raw, urlencoded } from 'express';
import { Server } from 'http';
import helmet from 'helmet';
import { ApiFieldError } from '../common/dto/api-response.dto';
import { AllExceptionsFilter, HttpExceptionFilter } from '../common/filters/all-exceptions.filter';
import { parseTrustProxy } from './trust-proxy';

/**
 * How long an idle client connection stays open. Clients (the phone, the hosting proxy in front of
 * the API) send their next request on a connection they keep; Node closes idle ones after 5 s, and a
 * request sent on a connection that was just closed fails without an answer (an upload cannot be
 * sent again). Longer than the proxies in front of the API keep theirs (commonly 60 s).
 */
export const KEEP_ALIVE_TIMEOUT_MS = 65_000;

/**
 * Global HTTP pipeline shared by main.ts and the e2e test harness, so tests exercise exactly
 * the production configuration (prefix, parsers, helmet, CORS, validation, error shape).
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>('apiPrefix', 'api/v1');
  const corsOrigins = config.get<string[]>('corsOrigins', []);
  const bodyLimit = config.get<number>('bodySizeLimit', 1_048_576);

  const server = app.getHttpServer() as Server;
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  // Waiting for a request's headers must outlast the idle wait, or the socket is cut first.
  server.headersTimeout = KEEP_ALIVE_TIMEOUT_MS + 1_000;

  // Client IPs feed the per-client rate limits; an invalid value throws here, at boot.
  app.getHttpAdapter().getInstance().set('trust proxy', parseTrustProxy(config.get<string>('trustProxy')));

  // Payment webhooks get the exact bytes, whatever their content type: the signature is computed
  // over the raw body and checked before anything is parsed (a signed body that is not valid JSON
  // is still recorded for review). Registered first, so the JSON parser leaves these requests alone.
  app.use(`/${apiPrefix.replace(/^\/+|\/+$/g, '')}/webhooks/payments`, raw({ type: () => true, limit: bodyLimit }));
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
