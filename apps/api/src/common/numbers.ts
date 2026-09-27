/** Prisma Decimal qiymatini oddiy songa aylantiradi. */
export function num(value: { toNumber(): number } | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : value.toNumber();
}

export function numOr(value: { toNumber(): number } | number | null | undefined, fallback: number): number {
  return num(value) ?? fallback;
}
