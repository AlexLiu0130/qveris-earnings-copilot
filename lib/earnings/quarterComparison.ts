import type { EarningsAnalysis } from "@/lib/earnings/types";

export type QuarterComparisonField =
  | "revenueActual"
  | "revenueEstimate"
  | "epsActual"
  | "epsEstimate"
  | "grossMargin"
  | "operatingMargin"
  | "netIncome"
  | "oneDayMovePct"
  | "fiveDayMovePct"
  | "guidanceText";

export interface QuarterComparisonRow {
  eventKey: string;
  fiscalPeriod?: string;
  reportDate?: string;
  revenueActual?: number;
  revenueEstimate?: number;
  revenueSurprisePct?: number;
  epsActual?: number;
  epsEstimate?: number;
  epsSurprisePct?: number;
  grossMargin?: number;
  operatingMargin?: number;
  netIncome?: number;
  oneDayMovePct?: number;
  fiveDayMovePct?: number;
  guidanceText?: string;
  analysisId: string;
  sourceIds: string[];
  fieldSourceIds: Partial<Record<QuarterComparisonField, string[]>>;
}

type InternalRow = QuarterComparisonRow & {
  fiscalYear?: number;
  fiscalEndDate?: string;
  fiscalKey?: string;
  sortDate?: string;
};

const FIELDS = [
  "fiscalPeriod",
  "reportDate",
  "revenueActual",
  "revenueEstimate",
  "epsActual",
  "epsEstimate",
  "grossMargin",
  "operatingMargin",
  "netIncome",
  "oneDayMovePct",
  "fiveDayMovePct",
  "guidanceText",
] as const;

export function buildQuarterComparison(analyses: EarningsAnalysis[], limit = 8): QuarterComparisonRow[] {
  const capped = Math.min(Math.max(Math.trunc(limit), 1), 12);
  const rows: InternalRow[] = [];

  for (const analysis of [...analyses].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))) {
    for (const candidate of candidates(analysis)) {
      const existing = rows.find((row) => sameQuarter(row, candidate));
      if (existing) mergeMissing(existing, candidate);
      else rows.push(candidate);
    }
  }

  return rows
    .map((row) => withSurprises(row))
    .sort((a, b) => (b.sortDate ?? "").localeCompare(a.sortDate ?? ""))
    .slice(0, capped)
    .map(({
      fiscalYear: _fiscalYear,
      fiscalEndDate: _fiscalEndDate,
      fiscalKey: _fiscalKey,
      sortDate: _sortDate,
      ...row
    }) => row);
}

function candidates(analysis: EarningsAnalysis): InternalRow[] {
  const event = analysis.event ?? analysis.recentEvent ?? analysis.upcomingEvent;
  const out: InternalRow[] = [];

  if (event) {
    const revenueActual = analysis.results?.revenueActual ?? event.revenueActual;
    const revenueEstimate = analysis.estimates?.revenueEstimate ?? event.revenueEstimate;
    const epsActual = analysis.results?.epsActual ?? event.epsActual;
    const epsEstimate = analysis.estimates?.epsEstimate ?? event.epsEstimate;
    const grossMargin = analysis.results?.grossMargin;
    const operatingMargin = analysis.results?.operatingMargin;
    const netIncome = analysis.results?.netIncome;
    const oneDayMovePct = analysis.marketReaction?.closeChangePct;
    const guidanceText = analysis.results?.guidanceText;
    const fieldSourceIds: QuarterComparisonRow["fieldSourceIds"] = {
      revenueActual: analysis.results?.revenueActual != null ? sourceIdsFor(analysis.results, "revenueActual") : eventIds(event, event.revenueActual),
      revenueEstimate: analysis.estimates?.revenueEstimate != null ? sourceIdsFor(analysis.estimates, "revenueEstimate") : eventIds(event, event.revenueEstimate),
      epsActual: analysis.results?.epsActual != null ? sourceIdsFor(analysis.results, "epsActual") : eventIds(event, event.epsActual),
      epsEstimate: analysis.estimates?.epsEstimate != null ? sourceIdsFor(analysis.estimates, "epsEstimate") : eventIds(event, event.epsEstimate),
      grossMargin: sourceIdsFor(analysis.results, "grossMargin", grossMargin),
      operatingMargin: sourceIdsFor(analysis.results, "operatingMargin", operatingMargin),
      netIncome: sourceIdsFor(analysis.results, "netIncome", netIncome),
      oneDayMovePct: eventIds(analysis.marketReaction, oneDayMovePct),
      guidanceText: sourceIdsFor(analysis.results, "guidanceText", guidanceText),
    };
    out.push(row(analysis, {
      eventKey: event.id,
      fiscalYear: event.fiscalYear,
      fiscalPeriod: event.fiscalPeriod,
      reportDate: event.reportDate,
      revenueActual,
      revenueEstimate,
      epsActual,
      epsEstimate,
      grossMargin,
      operatingMargin,
      netIncome,
      oneDayMovePct,
      guidanceText,
      fieldSourceIds,
    }));
  }

  for (const item of analysis.historicalPattern) {
    const fieldSourceIds = objectFieldSourceIds(item, {
      revenueActual: item.revenueActual,
      revenueEstimate: item.revenueEstimate,
      epsActual: item.epsActual,
      epsEstimate: item.epsEstimate,
      oneDayMovePct: item.oneDayMovePct,
      fiveDayMovePct: item.fiveDayMovePct,
    });
    out.push(row(analysis, {
      eventKey: item.eventId,
      fiscalPeriod: item.fiscalPeriod,
      reportDate: item.reportDate,
      revenueActual: item.revenueActual,
      revenueEstimate: item.revenueEstimate,
      epsActual: item.epsActual,
      epsEstimate: item.epsEstimate,
      oneDayMovePct: item.oneDayMovePct,
      fiveDayMovePct: item.fiveDayMovePct,
      fieldSourceIds,
    }));
  }

  for (const item of analysis.financials) {
    const fieldSourceIds = objectFieldSourceIds(item, {
      revenueActual: item.revenue,
      grossMargin: item.grossMargin,
      operatingMargin: item.operatingMargin,
      netIncome: item.netIncome,
    });
    out.push(row(analysis, {
      eventKey: `financial:${item.date}`,
      fiscalYear: item.fiscalYear,
      fiscalEndDate: item.date,
      fiscalPeriod: item.period,
      revenueActual: item.revenue,
      grossMargin: item.grossMargin,
      operatingMargin: item.operatingMargin,
      netIncome: item.netIncome,
      fieldSourceIds,
      sortDate: item.date,
    }));
  }

  return out;
}

function row(analysis: EarningsAnalysis, input: Omit<InternalRow, "analysisId" | "sourceIds" | "fieldSourceIds"> & { fieldSourceIds?: QuarterComparisonRow["fieldSourceIds"] }) {
  const fieldSourceIds = cleanFieldSourceIds(input.fieldSourceIds);
  return {
    ...input,
    analysisId: analysis.analysisId,
    fieldSourceIds,
    sourceIds: unique(Object.values(fieldSourceIds).flat()),
    fiscalEndDate: input.fiscalEndDate ?? fiscalEndDate(input.fiscalPeriod),
    fiscalKey: fiscalKey(input),
    sortDate: input.sortDate ?? input.reportDate,
  };
}

function mergeMissing(target: InternalRow, source: InternalRow) {
  for (const field of FIELDS) {
    if (target[field] == null && source[field] != null) {
      (target[field] as InternalRow[typeof field]) = source[field];
      if (isSourceField(field)) target.fieldSourceIds[field] = source.fieldSourceIds[field];
    }
  }
  if (fiscalEndDate(target.fiscalPeriod) && isQuarterLabel(source.fiscalPeriod)) target.fiscalPeriod = source.fiscalPeriod;
  target.fiscalYear ??= source.fiscalYear;
  target.sourceIds = unique(Object.values(target.fieldSourceIds).flat());
  target.sortDate ??= source.sortDate;
  target.fiscalEndDate ??= source.fiscalEndDate;
  target.fiscalKey ??= source.fiscalKey ?? fiscalKey(target);
}

function sameQuarter(a: InternalRow, b: InternalRow) {
  if (a.eventKey === b.eventKey) return true;
  if (fiscalIdentityMatches(a, b)) return true;
  if (compatibleReportDateAlias(a, b)) return true;
  if (hasFiscalIdentity(a) || hasFiscalIdentity(b)) return false;
  return Boolean(a.reportDate && b.reportDate && a.reportDate === b.reportDate);
}

function withSurprises(row: InternalRow): InternalRow {
  return {
    ...row,
    revenueSurprisePct: surprise(row.revenueActual, row.revenueEstimate),
    epsSurprisePct: surprise(row.epsActual, row.epsEstimate),
  };
}

function surprise(actual?: number, estimate?: number) {
  if (actual == null || estimate == null || estimate === 0) return undefined;
  return ((actual - estimate) / Math.abs(estimate)) * 100;
}

function fiscalKey(row: Pick<InternalRow, "fiscalYear" | "fiscalPeriod">) {
  const quarter = row.fiscalPeriod?.match(/Q([1-4])/i)?.[1];
  if (row.fiscalYear && quarter) return `${row.fiscalYear}:Q${quarter}`;
  return undefined;
}

function fiscalEndDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function isQuarterLabel(value?: string) {
  return Boolean(value?.match(/^Q[1-4]$/i));
}

function hasFiscalIdentity(row: InternalRow) {
  return Boolean(row.fiscalKey || row.fiscalEndDate);
}

function fiscalIdentityMatches(a: InternalRow, b: InternalRow) {
  return Boolean(
    (a.fiscalKey && b.fiscalKey && a.fiscalKey === b.fiscalKey)
      || (a.fiscalEndDate && b.fiscalEndDate && a.fiscalEndDate === b.fiscalEndDate),
  );
}

function compatibleReportDateAlias(a: InternalRow, b: InternalRow) {
  return Boolean(
    a.reportDate
      && a.reportDate === b.reportDate
      && !fiscalYearConflicts(a, b)
      && ((isQuarterLabel(a.fiscalPeriod) && b.fiscalEndDate) || (isQuarterLabel(b.fiscalPeriod) && a.fiscalEndDate)),
  );
}

function fiscalYearConflicts(a: InternalRow, b: InternalRow) {
  return a.fiscalYear != null && b.fiscalYear != null && a.fiscalYear !== b.fiscalYear;
}

function sourceIdsFor<T extends { sourceIds: string[]; fieldSourceIds?: Partial<Record<string, string[]>> } | null | undefined>(
  value: T,
  field: string,
  fieldValue: unknown = true,
) {
  if (fieldValue == null || !value) return [];
  if (value.fieldSourceIds) return value.fieldSourceIds[field] ?? [];
  return value.sourceIds;
}

function eventIds(value: { sourceIds: string[] } | null | undefined, fieldValue: unknown) {
  return fieldValue == null ? [] : value?.sourceIds ?? [];
}

function objectFieldSourceIds(
  value: { sourceIds: string[] },
  fields: Partial<Record<QuarterComparisonField, unknown>>,
): QuarterComparisonRow["fieldSourceIds"] {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, fieldValue]) => fieldValue != null)
      .map(([field]) => [field, value.sourceIds]),
  ) as QuarterComparisonRow["fieldSourceIds"];
}

function cleanFieldSourceIds(value: QuarterComparisonRow["fieldSourceIds"] = {}) {
  return Object.fromEntries(
    Object.entries(value)
      .map(([field, ids]) => [field, unique(ids ?? [])])
      .filter(([, ids]) => (ids as string[]).length > 0),
  ) as QuarterComparisonRow["fieldSourceIds"];
}

function isSourceField(field: string): field is QuarterComparisonField {
  return [
    "revenueActual",
    "revenueEstimate",
    "epsActual",
    "epsEstimate",
    "grossMargin",
    "operatingMargin",
    "netIncome",
    "oneDayMovePct",
    "fiveDayMovePct",
    "guidanceText",
  ].includes(field);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
