import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap/configure-app';
import { PrismaService } from '../../src/database/prisma.service';
import { MailService } from '../../src/mail/mail.service';
import { TestMailbox } from './mailbox';

export const API = '/api/v1';

export type TestApp = {
  app: INestApplication;
  http: ReturnType<typeof request>;
  mailbox: TestMailbox;
  prisma: PrismaService;
  close: () => Promise<void>;
};

export type TestAppOptions = {
  /** Environment overrides applied before the module graph is built (restored on close). */
  env?: Record<string, string | undefined>;
  /** Extra provider overrides (e.g. a JWKS source with test keys). */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
};

/**
 * Boots the real AppModule with the production bootstrap (`configureApp`): same global prefix,
 * body parsers, helmet, validation pipe, filters and guards. Only SMTP is swapped for a mailbox.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(options.env ?? {})) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const mailbox = new TestMailbox();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mailbox);
  if (options.configure) {
    builder = options.configure(builder);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, logger: ['error'] });
  configureApp(app);
  // A real listening socket on an ephemeral loopback port (HTTP + WebSocket gateway).
  await app.listen(0, '127.0.0.1');

  return {
    app,
    http: request(app.getHttpServer()),
    mailbox,
    prisma: app.get(PrismaService),
    close: async () => {
      await app.close();
      for (const [key, value] of previous) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    },
  };
}
