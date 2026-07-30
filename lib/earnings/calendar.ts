import { getEarningsProvider } from "@/lib/capabilities/provider";
import type { EarningsCapabilityProvider } from "@/lib/capabilities/EarningsCapabilityProvider";
import { addDaysIso, todayIso } from "@/lib/earnings/date";
import { getCompanyProfiles } from "@/lib/earnings/companies";
import { dataIssue, isQVerisCapabilityError } from "@/lib/earnings/providerIssues";
import { getStoredCalendarSnapshot, saveCalendarSnapshot } from "@/lib/earnings/analysisStore";
import { sourceIdsFrom, uniqueSources } from "@/lib/earnings/sourceRefs";
import type { DataIssue, EarningsCalendarParams, EarningsEvent, SourceRef } from "@/lib/earnings/types";
import { localEnv } from "@/lib/runtime/env";

type CalendarResponse = Awaited<ReturnType<typeof uncachedEarningsCalendar>>;

const cache = new Map<string, { expiresAt: number; value: CalendarResponse }>();

export async function getEarningsCalendar(params: Partial<EarningsCalendarParams>, provider?: EarningsCapabilityProvider) {
  const normalized = normalizeParams(params);
  if (provider) return uncachedEarningsCalendar(normalized, provider);
  const key = JSON.stringify(normalized);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return { ...cached.value, cached: true };

  const value = await uncachedEarningsCalendar(normalized);
  if (value.issues.length === 0) cache.set(key, { value, expiresAt: now + cacheTtlMs() });
  return { ...value, cached: false };
}

async function uncachedEarningsCalendar(params: EarningsCalendarParams, provider = getEarningsProvider()) {
  const from = params.from ?? todayIso();
  const to = params.to ?? addDaysIso(from, 14);
  const stored = await getStoredCalendarSnapshot(from, to);
  let events = await filterAndSort(stored.events, params);
  let sources = stored.sources.filter((source) => sourceIdsFrom(...events).includes(source.id));
  const issues: DataIssue[] = [];
  if (events.length && stored.latestSeenAt && Date.parse(stored.latestSeenAt) + cacheTtlMs() > Date.now()) {
    return { from, to, events, sources, issues, missing: [] };
  }
  try {
    const rawEvents = await provider.getEarningsCalendar({
      from,
      to,
      universe: params.universe,
      sector: params.sector,
      status: params.status,
      timing: params.timing,
      minMarketCap: params.minMarketCap,
    });
    events = await filterAndSort(mergeEvents(stored.events, rawEvents), params);
    const sourceIds = sourceIdsFrom(...events);
    sources = uniqueSources([...stored.sources, ...(provider.getSourceRefs?.() ?? [])])
      .filter((source) => sourceIds.includes(source.id));
    const resolvedSourceIds = new Set(sources.map((source) => source.id));
    for (const id of sourceIds.filter((sourceId) => !resolvedSourceIds.has(sourceId))) {
      issues.push(missingSourceIssue(id));
    }
    if (issues.length === 0) await saveCalendarSnapshot(events, sources);
  } catch (error) {
    if (!isQVerisCapabilityError(error)) throw error;
    issues.push(dataIssue("earningsCalendar", "EARNINGS_CALENDAR_UNAVAILABLE", error));
  }
  return {
    from,
    to,
    events,
    sources,
    issues,
    missing: issues.length
      ? [...new Set([
          ...issues.filter((issue) => issue.capability === "earningsCalendar").map((issue) => issue.capability),
          ...issues.filter((issue) => issue.capability === "sourceAudit").map((issue) => `source:${issue.toolId}`),
        ])]
      : [],
  };
}

function missingSourceIssue(id: string): DataIssue {
  return {
    capability: "sourceAudit",
    code: "SOURCE_REF_MISSING",
    toolId: id,
    retryable: false,
    occurredAt: new Date().toISOString(),
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

function mergeEvents(stored: EarningsEvent[], current: EarningsEvent[]) {
  const merged = new Map(stored.map((event) => [`${event.ticker}:${event.reportDate}`, event]));
  for (const event of current) {
    const key = `${event.ticker}:${event.reportDate}`;
    const previous = merged.get(key);
    merged.set(key, previous ? {
      ...previous,
      ...event,
      timing: event.timing === "unknown" ? previous.timing : event.timing,
      status: event.status === "reported" || previous.status === "reported" ? "reported" : event.status,
      revenueActual: event.revenueActual ?? previous.revenueActual,
      revenueEstimate: event.revenueEstimate ?? previous.revenueEstimate,
      epsActual: event.epsActual ?? previous.epsActual,
      epsEstimate: event.epsEstimate ?? previous.epsEstimate,
      sourceIds: [...new Set([...previous.sourceIds, ...event.sourceIds])],
    } : event);
  }
  return [...merged.values()];
}

function cacheTtlMs() {
  const configured = Number(localEnv().EARNINGS_CACHE_TTL_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 30 * 60 * 1000;
}
