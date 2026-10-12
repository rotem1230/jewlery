import { Prisma } from '@prisma/client';

/**
 * Prisma keeps `DateTime` values in `timestamp without time zone` columns as UTC wall-clock time.
 * A JS Date interpolated into raw SQL is bound as `timestamptz`, and PostgreSQL converts it using
 * the session TimeZone — on a server not running in UTC every comparison / write is shifted by
 * the zone offset. Always pass dates to raw SQL through this helper.
 */
export function sqlTimestamp(date: Date): Prisma.Sql {
  return Prisma.sql`${date.toISOString().slice(0, -1)}::timestamp`;
}
