import { Prisma } from "@prisma/client";

/** Matches `Document.currency` column length; trims AI output that may include full names. */
const MAX_CURRENCY_LEN = 32;

export function normalizeCurrencyForStorage(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const t = value.trim();
  if (!t) return null;
  return t.length <= MAX_CURRENCY_LEN ? t : t.slice(0, MAX_CURRENCY_LEN);
}

export function toDecimal(n: number | null | undefined): Prisma.Decimal | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return new Prisma.Decimal(n);
}
