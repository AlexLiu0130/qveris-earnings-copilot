export function parseMinMarketCapBillions(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000_000 : undefined;
}
