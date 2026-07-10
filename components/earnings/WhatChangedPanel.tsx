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
  const revenueIds = results?.fieldSourceIds?.revenueActual ?? latestFinancials?.sourceIds;
  const epsIds = results?.fieldSourceIds?.epsActual ?? results?.sourceIds;
  const marginIds = results?.fieldSourceIds?.grossMargin ?? latestFinancials?.sourceIds;

  const tone = transcript?.available ? transcript.managementTone ?? "unavailable" : "unavailable";

  const rows: Array<{ field: string; current: string; prev: string; change: React.ReactNode; ids?: string[] }> = [
    {
      field: t.flash.revenue,
      current: u(fmtMoney(revenueActual), un),
      prev: u(fmtMoney(priorRevenue), un),
      change: u(deltaPct(revenueActual, priorRevenue), un),
      ids: revenueIds,
    },
    {
      field: t.flash.eps,
      current: u(fmtEps(results?.epsActual), un),
      prev: u(fmtEps(prior?.epsActual), un),
      change: u(deltaPct(results?.epsActual, prior?.epsActual), un),
      ids: epsIds,
    },
    {
      field: t.flash.grossMargin,
      current: grossMargin == null ? un : `${grossMargin.toFixed(1)}%`,
      prev: priorGrossMargin == null ? un : `${priorGrossMargin.toFixed(1)}%`,
      change: u(deltaPct(grossMargin, priorGrossMargin), un),
      ids: marginIds,
    },
    {
      field: t.flash.guidance,
      current: results?.guidanceText ? "—" : un,
      prev: "—",
      change: beatMiss ? <BeatMissTag value={beatMiss.guidance} /> : un,
      ids: results?.fieldSourceIds?.guidanceText ?? results?.sourceIds,
    },
    {
      field: t.call.managementTone,
      current: t.call.tone[tone] ?? tone,
      prev: "—",
      change: "—",
      ids: transcript?.sourceIds,
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
                {row.current !== un && row.current !== "—" && row.ids && <Cite ids={row.ids} sources={sources} />}
              </td>
              <td className="text-ink-soft">
                {row.prev}
                {row.prev !== un && row.prev !== "—" && prior && <Cite ids={prior.sourceIds} sources={sources} />}
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
                      {u(fmtMoney(row.revenueActual), un)} / {u(fmtMoney(row.revenueEstimate), un)}
                      <Cite ids={row.sourceIds} sources={sources} />
                    </td>
                    <td className="text-ink-soft">
                      {u(fmtEps(row.epsActual), un)} / {u(fmtEps(row.epsEstimate), un)}
                    </td>
                    <td className={moveTone(row.oneDayMovePct)}>{u(fmtPct(row.oneDayMovePct), un)}</td>
                    <td className={moveTone(row.fiveDayMovePct)}>{u(fmtPct(row.fiveDayMovePct), un)}</td>
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

function moveTone(value: number | undefined) {
  if (value == null) return "text-ink-faint";
  return value >= 0 ? "text-beat" : "text-miss";
}
