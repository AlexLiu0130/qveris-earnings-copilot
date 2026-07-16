import type { EarningsAnalysis, HistoricalEarnings } from "@/lib/earnings/types";
import { fmtDate, fmtEps, fmtMoney, fmtPct } from "@/lib/formatting/format";
import { u } from "@/lib/i18n/dict";
import { getDict } from "@/lib/i18n/server";
import { selectFiscalPeriod } from "@/lib/earnings/dataQuality";
import { BeatMissTag } from "./BeatMissTag";
import { Cite } from "./Cite";

/* display-only delta vs the prior quarter; no verdicts derived client-side */
function deltaPct(current?: number, prior?: number): string {
  if (current == null || prior == null || prior === 0) return "unavailable";
  return fmtPct(((current - prior) / Math.abs(prior)) * 100);
}

export async function WhatChangedPanel({ analysis }: { analysis: EarningsAnalysis }) {
  const { lang, t } = await getDict();
  const { results, historicalPattern, transcript, beatMiss, sources } = analysis;
  const latestFinancials = selectFiscalPeriod(analysis.financials, analysis.event);
  const priorFinancials = analysis.financials
    .filter((period) => !latestFinancials || period.date < latestFinancials.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const un = t.common.unavailable;

  const eventDate = analysis.recentEvent?.reportDate ?? analysis.event?.reportDate;
  const prior: HistoricalEarnings | undefined = [...historicalPattern]
    .filter((row) => !eventDate || row.reportDate < eventDate)
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0];
  const revenueActual = results?.revenueActual ?? latestFinancials?.revenue;
  const grossMarginRatio = results?.grossMargin ?? latestFinancials?.grossMargin;
  const grossMargin = grossMarginRatio == null ? undefined : grossMarginRatio * 100;
  const priorRevenue = prior?.revenueActual ?? priorFinancials?.revenue;
  const priorGrossMargin = priorFinancials?.grossMargin == null ? undefined : priorFinancials.grossMargin * 100;
  const revenueIds = results?.revenueActual != null ? results.fieldSourceIds?.revenueActual : latestFinancials?.sourceIds;
  const priorRevenueIds = prior?.revenueActual != null ? prior.sourceIds : priorFinancials?.sourceIds;
  const epsIds = results?.fieldSourceIds?.epsActual;
  const priorEpsIds = prior?.epsActual != null ? prior.sourceIds : undefined;
  const marginIds = results?.grossMargin != null ? results.fieldSourceIds?.grossMargin : latestFinancials?.sourceIds;
  const priorMarginIds = priorGrossMargin == null ? undefined : priorFinancials?.sourceIds;

  const tone = transcript?.available ? transcript.managementTone ?? "unavailable" : "unavailable";

  const rows: Array<{ field: string; current: string; prev: string; change: React.ReactNode; currentIds?: string[]; prevIds?: string[] }> = [
    {
      field: t.flash.revenue,
      current: sourced(fmtMoney(revenueActual), revenueIds, un),
      prev: sourced(fmtMoney(priorRevenue), priorRevenueIds, un),
      change: sourced(deltaPct(revenueActual, priorRevenue), idsForDelta(revenueIds, priorRevenueIds), un),
      currentIds: revenueIds,
      prevIds: priorRevenueIds,
    },
    {
      field: t.flash.eps,
      current: sourced(fmtEps(results?.epsActual), epsIds, un),
      prev: sourced(fmtEps(prior?.epsActual), priorEpsIds, un),
      change: sourced(deltaPct(results?.epsActual, prior?.epsActual), idsForDelta(epsIds, priorEpsIds), un),
      currentIds: epsIds,
      prevIds: priorEpsIds,
    },
    {
      field: t.flash.grossMargin,
      current: sourced(grossMargin == null ? "unavailable" : `${grossMargin.toFixed(1)}%`, marginIds, un),
      prev: sourced(priorGrossMargin == null ? "unavailable" : `${priorGrossMargin.toFixed(1)}%`, priorMarginIds, un),
      change: sourced(deltaPct(grossMargin, priorGrossMargin), idsForDelta(marginIds, priorMarginIds), un),
      currentIds: marginIds,
      prevIds: priorMarginIds,
    },
    {
      field: t.flash.guidance,
      current: results?.guidanceText && results.fieldSourceIds?.guidanceText?.length ? "—" : un,
      prev: "—",
      change: beatMiss && results?.fieldSourceIds?.guidanceText?.length ? <BeatMissTag value={beatMiss.guidance} /> : un,
      currentIds: results?.fieldSourceIds?.guidanceText,
    },
    {
      field: t.call.managementTone,
      current: sourced(t.call.tone[tone] ?? tone, transcript?.sourceIds, un),
      prev: "—",
      change: "—",
      currentIds: transcript?.sourceIds,
    },
  ];

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl italic text-ink">{t.whatChanged.title}</h2>
        {prior && (
          <span className="label">
            {t.whatChanged.prior}: {prior.fiscalPeriod ?? fmtDate(prior.reportDate, lang)}
          </span>
        )}
      </div>

      <table className="num mt-4 w-full text-sm">
        <thead>
          <tr className="label text-left">
            <th className="pb-2 font-normal">{t.whatChanged.field}</th>
            <th className="pb-2 font-normal">{t.whatChanged.current}</th>
            <th className="pb-2 font-normal">{t.whatChanged.prior}</th>
            <th className="pb-2 font-normal">{t.whatChanged.change}</th>
          </tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-2 [&_td]:pr-3">
          {rows.map((row) => (
            <tr key={row.field}>
              <td className="text-ink-soft">{row.field}</td>
              <td className="text-ink">
                {row.current}
                {row.current !== un && row.current !== "—" && row.currentIds && <Cite ids={row.currentIds} sources={sources} />}
              </td>
              <td className="text-ink-soft">
                {row.prev}
                {row.prev !== un && row.prev !== "—" && row.prevIds && <Cite ids={row.prevIds} sources={sources} />}
              </td>
              <td className="text-ink-soft">{row.change}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {historicalPattern.length > 0 && (
        <details className="sources hairline mt-4 pt-3">
          <summary className="label text-accent">
            {t.whatChanged.history} · {t.historical.lastQuarters(analysis.historicalSummary.quarters)}
            {analysis.historicalSummary.limitedHistory && ` · ${t.historical.limitedHistory}`}
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="num w-full text-sm">
              <thead>
                <tr className="label text-left">
                  <th className="pb-2 pr-4 font-normal">{t.historical.thPeriod}</th>
                  <th className="pb-2 pr-4 font-normal">{t.historical.thReported}</th>
                  <th className="pb-2 pr-4 font-normal">{t.historical.thRev}</th>
                  <th className="pb-2 pr-4 font-normal">{t.historical.thEps}</th>
                  <th className="pb-2 pr-4 font-normal">1d</th>
                  <th className="pb-2 font-normal">5d</th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-2 [&_td]:pr-4">
                {historicalPattern.map((row) => (
                  <tr key={row.eventId}>
                    <td className="text-ink">{row.fiscalPeriod ?? "—"}</td>
                    <td className="text-ink-soft">{fmtDate(row.reportDate, lang)}</td>
                    <td className="text-ink-soft">
                      {valueWithCite(fmtMoney(row.revenueActual), historicalIds(row, "revenueActual"), un, sources)} / {valueWithCite(fmtMoney(row.revenueEstimate), historicalIds(row, "revenueEstimate"), un, sources)}
                    </td>
                    <td className="text-ink-soft">
                      {valueWithCite(fmtEps(row.epsActual), historicalIds(row, "epsActual"), un, sources)} / {valueWithCite(fmtEps(row.epsEstimate), historicalIds(row, "epsEstimate"), un, sources)}
                    </td>
                    <td className={moveTone(historicalIds(row, "oneDayMovePct")?.length ? row.oneDayMovePct : undefined)}>
                      {valueWithCite(fmtPct(row.oneDayMovePct), historicalIds(row, "oneDayMovePct"), un, sources)}
                    </td>
                    <td className={moveTone(historicalIds(row, "fiveDayMovePct")?.length ? row.fiveDayMovePct : undefined)}>
                      {valueWithCite(fmtPct(row.fiveDayMovePct), historicalIds(row, "fiveDayMovePct"), un, sources)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function sourced(value: string, ids: string[] | undefined, un: string) {
  return ids?.length ? u(value, un) : un;
}

function valueWithCite(value: string, ids: string[] | undefined, un: string, sources: EarningsAnalysis["sources"]) {
  if (!ids?.length) return un;
  return (
    <>
      {u(value, un)}
      <Cite ids={ids} sources={sources} />
    </>
  );
}

function historicalIds(row: HistoricalEarnings, field: "revenueActual" | "revenueEstimate" | "epsActual" | "epsEstimate" | "oneDayMovePct" | "fiveDayMovePct") {
  return row[field] == null ? undefined : row.sourceIds;
}

function idsForDelta(currentIds: string[] | undefined, priorIds: string[] | undefined) {
  return currentIds?.length && priorIds?.length ? [...currentIds, ...priorIds] : undefined;
}

function moveTone(value: number | undefined) {
  if (value == null) return "text-ink-faint";
  return value >= 0 ? "text-beat" : "text-miss";
}
