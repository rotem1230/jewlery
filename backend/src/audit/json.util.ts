import { Prisma } from '@prisma/client';

/** Deep-clones a value through JSON serialization so Date/Decimal/etc. become
 * plain JSON-safe values before being stored in a Prisma `Json` column. */
export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
