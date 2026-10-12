import { ArgumentsHost, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, { code, clientVersion: 'test', meta });
}

function run(exception: unknown) {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      sent.body = body;
      return this;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return sent;
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['P2002', 409],
    ['P2025', 404],
    ['P2023', 404],
    ['P2028', 503],
    ['P2034', 409],
  ])('maps Prisma %s to %i instead of a 500', (code, status) => {
    const sent = run(prismaError(code));
    expect(sent.status).toBe(status);
    expect(sent.body?.success).toBe(false);
    expect(JSON.stringify(sent.body)).not.toContain('prisma');
  });

  it('maps an invalid uuid in raw SQL to 404', () => {
    expect(run(prismaError('P2010', { code: '22P02' })).status).toBe(404);
  });

  it('keeps unknown failures as an opaque 500', () => {
    const sent = run(new Error('database password is hunter2'));
    expect(sent.status).toBe(500);
    expect(sent.body).toEqual({ success: false, message: 'Internal server error' });
  });
});
