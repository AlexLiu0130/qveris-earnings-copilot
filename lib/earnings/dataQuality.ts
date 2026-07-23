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
    conflicts.push(zh ? "日历营收预期与同财季一致预期不一致，已采用同财季一致预期。" : "Calendar revenue estimate differs from the same-quarter consensus; using the same-quarter consensus.");
  }
  if (
    event?.epsEstimate != null
    && input.estimates?.epsEstimate != null
    && meaningfullyDifferent(event.epsEstimate, input.estimates.epsEstimate, 0.01, 0.01)
  ) {
    conflicts.push(zh ? "日历 EPS 预期与同财季一致预期不一致，已采用同财季一致预期。" : "Calendar EPS estimate differs from the same-quarter consensus; using the same-quarter consensus.");
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
    ? history.find((row) => sameEarningsPeriod(row, event) && (row.revenueEstimate != null || row.epsEstimate != null))
    : undefined;
  const historicalRevenueIds = historical?.fieldSourceIds?.revenueEstimate ?? (historical?.revenueEstimate != null ? historical.sourceIds : undefined);
  const historicalEpsIds = historical?.fieldSourceIds?.epsEstimate ?? (historical?.epsEstimate != null ? historical.sourceIds : undefined);
  const revenueEstimate = historical?.revenueEstimate ?? estimates?.revenueEstimate;
  const epsEstimate = historical?.epsEstimate ?? estimates?.epsEstimate;
  const resolved = estimates || historical ? {
    ...estimates,
    ticker: event?.ticker ?? estimates!.ticker,
    eventId: event?.id ?? estimates?.eventId,
    revenueEstimate,
    epsEstimate,
    sourceIds: [...new Set([
      ...(estimates?.sourceIds ?? []),
      ...(historical && (historical.revenueEstimate != null || historical.epsEstimate != null) ? historical.sourceIds : []),
    ])],
    fieldSourceIds: {
      ...estimates?.fieldSourceIds,
      revenueEstimate: historical?.revenueEstimate != null
        ? historicalRevenueIds
        : estimates?.fieldSourceIds?.revenueEstimate ?? estimates?.sourceIds,
      epsEstimate: historical?.epsEstimate != null
        ? historicalEpsIds
        : estimates?.fieldSourceIds?.epsEstimate ?? estimates?.sourceIds,
    },
  } satisfies EarningsEstimates : null;
  if (!event || (event.revenueEstimate == null && event.epsEstimate == null)) return resolved;
  const providerIds = resolved?.sourceIds ?? [];
  return {
    ...resolved,
    ticker: event.ticker,
    eventId: event.id,
    revenueEstimate: historical?.revenueEstimate ?? event.revenueEstimate ?? resolved?.revenueEstimate,
    epsEstimate: historical?.epsEstimate ?? event.epsEstimate ?? resolved?.epsEstimate,
    sourceIds: [...new Set([...event.sourceIds, ...providerIds])],
    fieldSourceIds: {
      revenueEstimate: historical?.revenueEstimate != null
        ? historicalRevenueIds
        : event.revenueEstimate != null
          ? event.sourceIds
          : resolved?.fieldSourceIds?.revenueEstimate ?? providerIds,
      epsEstimate: historical?.epsEstimate != null
        ? historicalEpsIds
        : event.epsEstimate != null
          ? event.sourceIds
          : resolved?.fieldSourceIds?.epsEstimate ?? providerIds,
      estimateCount: resolved?.fieldSourceIds?.estimateCount ?? providerIds,
    },
  } satisfies EarningsEstimates;
}

function sameEarningsPeriod(row: HistoricalEarnings, event: EarningsEvent) {
  if (row.reportDate === event.reportDate) return true;
  const eventQuarter = quarter(event.fiscalPeriod);
  const rowQuarter = quarter(row.fiscalPeriod);
  const rowYear = row.fiscalPeriod?.match(/^(\d{4})-/)?.[1];
  return event.fiscalYear != null
    && eventQuarter != null
    && rowQuarter === eventQuarter
    && Number(rowYear) === event.fiscalYear;
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
  const named = value?.match(/Q([1-4])/i)?.[1];
  if (named) return named;
  const month = value?.match(/^\d{4}-(\d{2})-\d{2}$/)?.[1];
  return month ? String(Math.ceil(Number(month) / 3)) : undefined;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
