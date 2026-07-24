import { getEarningsProvider } from "@/lib/capabilities/provider";
import type { CompanyProfile } from "@/lib/earnings/types";

const cache = new Map<string, { expiresAt: number; value: CompanyProfile | null }>();
const TTL_MS = 6 * 60 * 60 * 1000;
const BATCH_SIZE = 8;
const marketCapCache = new Map<string, { expiresAt: number; value: number | null }>();

export async function getCompanyProfiles(tickers: string[]): Promise<Map<string, CompanyProfile>> {
  const provider = getEarningsProvider();
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  const now = Date.now();
  const map = new Map<string, CompanyProfile>();
  const missing = unique.filter((ticker) => {
    const cached = cache.get(ticker);
    if (!cached || cached.expiresAt <= now) return true;
    if (cached.value) map.set(ticker, cached.value);
    return false;
  });

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map((ticker) => provider.getCompanyProfile(ticker)));
    settled.forEach((result, index) => {
      const ticker = batch[index];
      const value = result.status === "fulfilled" ? result.value : null;
      cache.set(ticker, { value, expiresAt: now + TTL_MS });
      if (value) map.set(ticker, value);
    });
  }

  return map;
}

export async function getCompanyMarketCaps(tickers: string[]): Promise<Map<string, number>> {
  const provider = getEarningsProvider();
  const unique = [...new Set(tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean))].sort();
  const now = Date.now();
  const map = new Map<string, number>();
  const missing = unique.filter((ticker) => {
    const cached = marketCapCache.get(ticker);
    if (!cached || cached.expiresAt <= now) return true;
    if (cached.value != null) map.set(ticker, cached.value);
    return false;
  });
  if (!missing.length) return map;

  const values = provider.getMarketCaps
    ? await provider.getMarketCaps(missing)
    : new Map([...await getCompanyProfiles(missing)].flatMap(([ticker, company]) => (
        company.marketCap == null ? [] : [[ticker, company.marketCap]]
      )));
  for (const [ticker, value] of values) {
    marketCapCache.set(ticker, { value, expiresAt: now + TTL_MS });
    map.set(ticker, value);
  }
  for (const ticker of missing) {
    if (!values.has(ticker)) marketCapCache.set(ticker, { value: null, expiresAt: now + TTL_MS });
  }
  return map;
}
