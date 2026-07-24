import type { EarningsEvent } from "@/lib/earnings/types";

export function compareMarketCapDesc(
  a: EarningsEvent,
  b: EarningsEvent,
  marketCaps: Map<string, number>,
) {
  const aCap = marketCaps.get(a.ticker);
  const bCap = marketCaps.get(b.ticker);
  if (aCap == null && bCap == null) return 0;
  if (aCap == null) return 1;
  if (bCap == null) return -1;
  return bCap - aCap;
}
