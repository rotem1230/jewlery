import { Prisma } from '@prisma/client';
import { isTransientDatabaseError } from './prisma-errors';

function known(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: Prisma.prismaVersion.client, meta });
}

describe('isTransientDatabaseError', () => {
  it.each(['P2034', 'P2028', 'P2024', 'P1001', 'P1017'])('treats %s as worth a retry', (code) => {
    expect(isTransientDatabaseError(known(code))).toBe(true);
  });

  it.each(['40P01', '40001', '55P03'])('treats a raw-query failure with SQLSTATE %s as worth a retry', (sqlState) => {
    expect(isTransientDatabaseError(known('P2010', { code: sqlState }))).toBe(true);
  });

  it('does not retry what would fail the same way again', () => {
    expect(isTransientDatabaseError(known('P2002', { target: ['email'] }))).toBe(false);
    expect(isTransientDatabaseError(known('P2010', { code: '22P02' }))).toBe(false);
    expect(isTransientDatabaseError(new TypeError('cannot read properties of undefined'))).toBe(false);
    expect(isTransientDatabaseError(new Error('ledger bug'))).toBe(false);
  });
});
