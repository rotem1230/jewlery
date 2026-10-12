import { Prisma } from '@prisma/client';

/** Whether a reported payment is exactly the expected amount, in the expected currency. */
export function isExactPayment(
  amount: number | undefined,
  currency: string | undefined,
  expected: Prisma.Decimal,
  expectedCurrency: string,
): boolean {
  return (
    amount !== undefined &&
    currency !== undefined &&
    new Prisma.Decimal(amount).equals(expected) &&
    currency.toUpperCase() === expectedCurrency.toUpperCase()
  );
}

export function describeMoney(amount: number | Prisma.Decimal | undefined, currency: string | undefined): string {
  return `${amount?.toString() ?? '?'} ${currency?.toUpperCase() ?? '?'}`;
}
