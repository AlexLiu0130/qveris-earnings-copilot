import { getEarningsProvider } from "@/lib/capabilities/provider";
import { addDaysIso, todayIso } from "@/lib/earnings/date";
import { buildSourceRefs } from "@/lib/earnings/buildSourceRefs";
import { getCompanyProfiles } from "@/lib/earnings/companies";
import { sourceIdsFrom, uniqueSources } from "@/lib/earnings/sourceRefs";
import type { EarningsCalendarParams, EarningsEvent } from "@/lib/earnings/types";
import { localEnv } from "@/lib/runtime/env";

type CalendarResponse = Awaited<ReturnType<typeof uncachedEarningsCalendar>>;

const cache = new Map<string, { expiresAt: number; value: CalendarResponse }>();

export async function getEarningsCalendar(params: Partial<EarningsCalendarParams>) {
  const normalized = normalizeParams(params);
  const key = JSON.stringify(normalized);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return { ...cached.value, cached: true };

  const value = await uncachedEarningsCalendar(normalized);
  cache.set(key, { value, expiresAt: now + cacheTtlMs() });
  return { ...value, cached: false };
}

async function uncachedEarningsCalendar(params: EarningsCalendarParams) {
  const from = params.from ?? todayIso();
  const to = params.to ?? addDaysIso(from, 14);
  const provider = getEarningsProvider();
  const rawEvents = await provider.getEarningsCalendar({
    from,
    to,
    universe: params.universe,
    sector: params.sector,
    status: params.status,
    timing: params.timing,
    minMarketCap: params.minMarketCap,
  });
  const events = await filterAndSort(rawEvents, params);
  const sourceIds = sourceIdsFrom(...events);
  const sources = uniqueSources(sourceIds.flatMap((id) => buildSourceRefs(id.split("-")[0] ?? "QVERIS", [id])));
  return {
    from,
    to,
    events,
    sources,
    missing: events.length ? [] : ["earningsCalendar"],
  };
}

function normalizeParams(params: Partial<EarningsCalendarParams>): EarningsCalendarParams {
  const from = params.from ?? todayIso();
  return {
    from,
    to: params.to ?? addDaysIso(from, 14),
    universe: params.universe ?? localEnv().EARNINGS_UNIVERSE ?? "core",
    sector: params.sector,
    status: params.status,
    timing: params.timing,
    minMarketCap: params.minMarketCap,
  };
}

async function filterAndSort(events: EarningsEvent[], params: EarningsCalendarParams) {
  const filtered = events
    .filter((event) => !params.status || event.status === params.status)
    .filter((event) => !params.timing || event.timing === params.timing);

  if (!params.sector && params.minMarketCap == null) {
    return sortEvents(filtered);
  }

  const companies = await getCompanyProfiles(filtered.map((event) => event.ticker));
  const sector = params.sector?.toLowerCase();
  return sortEvents(filtered.filter((event) => {
    const company = companies.get(event.ticker);
    if (!company) return false;
    if (sector && !`${company.sector ?? ""} ${company.industry ?? ""}`.toLowerCase().includes(sector)) return false;
    return params.minMarketCap == null || (company.marketCap ?? 0) >= params.minMarketCap;
  }));
}

function sortEvents(events: EarningsEvent[]) {
  return [...events].sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.ticker.localeCompare(b.ticker));
}

function cacheTtlMs() {
  const configured = Number(localEnv().EARNINGS_CACHE_TTL_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 30 * 60 * 1000;
}
