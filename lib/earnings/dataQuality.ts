import type {
  EarningsEstimates,
  EarningsEvent,
  EarningsResults,
  FinancialStatementPeriod,
  HistoricalEarnings,
  NewsItem,
} from "@/lib/earnings/types";
import type { Lang } from "@/lib/i18n/dict";

export function filterRelevantNews(ticker: string, companyName: string | undefined, items: NewsItem[]) {
  const symbol = ticker.toLowerCase();
  const company = companyName
    ?.toLowerCase()
    .replace(/\b(incorporated|corporation|company|holdings|inc|corp|co|ltd|plc)\b.*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const symbolPattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(symbol)}([^a-z0-9]|$)`, "i");

  return items.filter((item) => {
    const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
    return symbolPattern.test(text) || Boolean(company && company.length >= 3 && text.includes(company));
  });
}

export function detectDataConflicts(input: {
  event?: EarningsEvent | null;
  estimates?: EarningsEstimates | null;
  results?: EarningsResults | null;
  financials: FinancialStatementPeriod[];
}, lang: Lang = "en") {
  const zh = lang === "zh";
  const { event, results } = input;
  const conflicts: string[] = [];

  if (
    event?.revenueEstimate != null
    && input.estimates?.revenueEstimate != null
    && meaningfullyDifferent(event.revenueEstimate, input.estimates.revenueEstimate, 0.005, 1)
  ) {
    conflicts.push(zh ? "事件营收预期与提供方营收预期不一致，已采用事件值。" : "Event revenue estimate differs from provider revenue estimate; using the event value.");
  }
  if (
    event?.epsEstimate != null
    && input.estimates?.epsEstimate != null
    && meaningfullyDifferent(event.epsEstimate, input.estimates.epsEstimate, 0.01, 0.01)
  ) {
    conflicts.push(zh ? "事件 EPS 预期与提供方 EPS 预期不一致，已采用事件值。" : "Event EPS estimate differs from provider EPS estimate; using the event value.");
  }

  const latest = input.financials[0];
  if (event?.status === "reported" && results && latest) {
    const eventQuarter = quarter(event.fiscalPeriod);
    const matching = input.financials.find((period) =>
      event.fiscalYear != null
      && eventQuarter != null
      && period.fiscalYear === event.fiscalYear
      && quarter(period.period) === eventQuarter,
    );
    if (matching && meaningfullyDifferent(results.revenueActual, matching.revenue, 0.01)) {
      conflicts.push(zh ? "财报营收实际值与同一季度财务报表存在重大差异。" : "Reported revenue differs materially from the matching quarterly financial statement.");
    }
    if (!matching && event.fiscalYear && latest.fiscalYear && event.fiscalYear !== latest.fiscalYear) {
      conflicts.push(zh ? "最新财务报表与本次财报事件的财年不匹配。" : "The latest financial statement does not match the earnings event fiscal year.");
    }
    const statementQuarter = quarter(latest.period);
    if (!matching && eventQuarter && statementQuarter && eventQuarter !== statementQuarter) {
      conflicts.push(zh ? "最新财务报表与本次财报事件的财季不匹配。" : "The latest financial statement does not match the earnings event fiscal quarter.");
    }
  }

  return conflicts;
}

export function resolveEventEstimates(
  event?: EarningsEvent | null,
  estimates?: EarningsEstimates | null,
  history: HistoricalEarnings[] = [],
) {
  const historical = event
    ? history.find((row) => row.reportDate === event.reportDate && (row.revenueEstimate != null || row.epsEstimate != null))
    : undefined;
  const resolved = estimates ?? (historical ? {
    ticker: event!.ticker,
    eventId: event!.id,
    revenueEstimate: historical.revenueEstimate,
    epsEstimate: historical.epsEstimate,
    sourceIds: historical.sourceIds,
    fieldSourceIds: {
      revenueEstimate: historical.fieldSourceIds?.revenueEstimate ?? (historical.revenueEstimate != null ? historical.sourceIds : undefined),
      epsEstimate: historical.fieldSourceIds?.epsEstimate ?? (historical.epsEstimate != null ? historical.sourceIds : undefined),
    },
  } satisfies EarningsEstimates : null);
  if (!event || (event.revenueEstimate == null && event.epsEstimate == null)) return resolved;
  const providerIds = resolved?.sourceIds ?? [];
  return {
    ...resolved,
    ticker: event.ticker,
    eventId: event.id,
    revenueEstimate: event.revenueEstimate ?? resolved?.revenueEstimate,
    epsEstimate: event.epsEstimate ?? resolved?.epsEstimate,
    sourceIds: [...new Set([...event.sourceIds, ...providerIds])],
    fieldSourceIds: {
      revenueEstimate: event.revenueEstimate != null
        ? event.sourceIds
        : resolved?.fieldSourceIds?.revenueEstimate ?? providerIds,
      epsEstimate: event.epsEstimate != null
        ? event.sourceIds
        : resolved?.fieldSourceIds?.epsEstimate ?? providerIds,
      estimateCount: resolved?.fieldSourceIds?.estimateCount ?? providerIds,
    },
  } satisfies EarningsEstimates;
}

export function selectFiscalPeriod<T extends { fiscalYear?: number; period?: string }>(
  rows: T[],
  event?: EarningsEvent | null,
) {
  if (!event) return rows[0];
  const eventQuarter = quarter(event.fiscalPeriod);
  if (event.fiscalYear == null || eventQuarter == null) return undefined;
  return rows.find((row) =>
    row.fiscalYear === event.fiscalYear
    && quarter(row.period) === eventQuarter,
  );
}

function meaningfullyDifferent(a?: number, b?: number, relativeTolerance = 0.05, absoluteTolerance = 0) {
  if (a == null || b == null) return false;
  const difference = Math.abs(a - b);
  return difference > absoluteTolerance && difference / Math.max(Math.abs(a), Math.abs(b), 1) > relativeTolerance;
}

function quarter(value?: string) {
  return value?.match(/Q([1-4])/i)?.[1];
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
