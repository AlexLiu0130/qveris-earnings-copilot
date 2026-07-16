import type { QuarterComparisonField, QuarterComparisonRow } from "@/lib/earnings/quarterComparison";
import type { SourceRef } from "@/lib/earnings/types";
import { fmtDate, fmtEps, fmtMoney, fmtPct } from "@/lib/formatting/format";
import { u } from "@/lib/i18n/dict";
import { Cite } from "./Cite";

const labels = {
  en: {
    title: "Multi-quarter comparison",
    period: "Quarter",
    reported: "Reported",
    revenue: "Revenue",
    eps: "EPS",
    actual: "actual",
    estimate: "est.",
    surprise: "surp.",
    grossMargin: "Gross margin",
    operatingMargin: "Op. margin",
    netIncome: "Net income",
    reaction: "Market reaction",
    guidance: "Guidance",
    sources: "Sources",
    empty: "No saved quarter history yet.",
    sourceCount: (count: number) => `${count} source${count === 1 ? "" : "s"}`,
  },
  zh: {
    title: "多季财报比较",
    period: "季度",
    reported: "报告日",
    revenue: "营收",
    eps: "EPS",
    actual: "实际",
    estimate: "预期",
    surprise: "超预期",
    grossMargin: "毛利率",
    operatingMargin: "经营利润率",
    netIncome: "净利润",
    reaction: "市场反应",
    guidance: "指引",
    sources: "来源",
    empty: "暂无已保存的季度历史。",
    sourceCount: (count: number) => `${count} 个来源`,
  },
};

export function MultiQuarterPanel({ rows, sources, language }: { rows: QuarterComparisonRow[]; sources: SourceRef[]; language: "en" | "zh" }) {
  const t = labels[language];
  const un = language === "zh" ? "不可用" : "unavailable";

  return (
    <section className="panel p-5">
      <h2 className="font-display text-2xl italic text-ink">{t.title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-faint">{t.empty}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="num min-w-[1120px] w-full text-sm">
            <thead>
              <tr className="label text-left">
                <th className="pb-2 pr-4 font-normal">{t.period}</th>
                <th className="pb-2 pr-4 font-normal">{t.reported}</th>
                <th className="pb-2 pr-4 font-normal">{t.revenue}</th>
                <th className="pb-2 pr-4 font-normal">{t.eps}</th>
                <th className="pb-2 pr-4 font-normal">{t.grossMargin}</th>
                <th className="pb-2 pr-4 font-normal">{t.operatingMargin}</th>
                <th className="pb-2 pr-4 font-normal">{t.netIncome}</th>
                <th className="pb-2 pr-4 font-normal">{t.reaction}</th>
                <th className="pb-2 pr-4 font-normal">{t.guidance}</th>
                <th className="pb-2 font-normal">{t.sources}</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top">
              {rows.map((row) => (
                <tr key={`${row.analysisId}:${row.eventKey}`}>
                  <td className="text-ink">{row.fiscalPeriod ?? "-"}</td>
                  <td className="text-ink-soft">{u(fmtDate(row.reportDate, language), un)}</td>
                  <td className="text-ink-soft">{metric(t.actual, sourced(fmtMoney(row.revenueActual), ids(row, "revenueActual"), un, sources), t.estimate, sourced(fmtMoney(row.revenueEstimate), ids(row, "revenueEstimate"), un, sources), t.surprise, sourced(fmtPct(row.revenueSurprisePct), surpriseIds(row, "revenueActual", "revenueEstimate"), un, sources))}</td>
                  <td className="text-ink-soft">{metric(t.actual, sourced(fmtEps(row.epsActual), ids(row, "epsActual"), un, sources), t.estimate, sourced(fmtEps(row.epsEstimate), ids(row, "epsEstimate"), un, sources), t.surprise, sourced(fmtPct(row.epsSurprisePct), surpriseIds(row, "epsActual", "epsEstimate"), un, sources))}</td>
                  <td className="text-ink-soft">{ratio(row.grossMargin, ids(row, "grossMargin"), un, sources)}</td>
                  <td className="text-ink-soft">{ratio(row.operatingMargin, ids(row, "operatingMargin"), un, sources)}</td>
                  <td className="text-ink-soft">{sourced(fmtMoney(row.netIncome), ids(row, "netIncome"), un, sources)}</td>
                  <td className="text-ink-soft">
                    1d {sourced(fmtPct(row.oneDayMovePct), ids(row, "oneDayMovePct"), un, sources)}
                    <br />
                    5d {sourced(fmtPct(row.fiveDayMovePct), ids(row, "fiveDayMovePct"), un, sources)}
                  </td>
                  <td className="max-w-[220px] text-ink-soft">
                    <span className="line-clamp-3">{sourced(row.guidanceText ?? "unavailable", ids(row, "guidanceText"), un, sources)}</span>
                  </td>
                  <td className="max-w-[220px] text-ink-faint">{sourceCell(row, t.sourceCount, un)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function metric(actualLabel: string, actual: React.ReactNode, estimateLabel: string, estimate: React.ReactNode, surpriseLabel: string, surprise: React.ReactNode) {
  return (
    <>
      {actualLabel}: {actual}
      <br />
      {estimateLabel}: {estimate}
      <br />
      {surpriseLabel}: {surprise}
    </>
  );
}

function ratio(value: number | undefined, sourceIds: string[] | undefined, un: string, sources: SourceRef[]) {
  return value == null ? un : sourced(fmtPct(value * 100, false), sourceIds, un, sources);
}

function sourced(value: string, sourceIds: string[] | undefined, un: string, sources: SourceRef[]) {
  if (!sourceIds?.length) return un;
  return (
    <>
      {u(value, un)}
      <Cite ids={sourceIds} sources={sources} />
    </>
  );
}

function ids(row: QuarterComparisonRow, field: QuarterComparisonField) {
  return row.fieldSourceIds[field];
}

function surpriseIds(row: QuarterComparisonRow, actualField: QuarterComparisonField, estimateField: QuarterComparisonField) {
  const actualIds = ids(row, actualField);
  const estimateIds = ids(row, estimateField);
  return actualIds?.length && estimateIds?.length ? [...actualIds, ...estimateIds] : undefined;
}

function sourceCell(row: QuarterComparisonRow, countLabel: (count: number) => string, un: string) {
  if (!sourceable(row)) return "-";
  if (!row.sourceIds.length) return un;
  return (
    <span className="block space-y-1">
      <span className="block">{countLabel(row.sourceIds.length)}</span>
      <span className="block break-all text-[10px] leading-snug">{row.sourceIds.join(", ")}</span>
    </span>
  );
}

function sourceable(row: QuarterComparisonRow) {
  const hasNumber = [
    row.revenueActual,
    row.revenueEstimate,
    row.revenueSurprisePct,
    row.epsActual,
    row.epsEstimate,
    row.epsSurprisePct,
    row.grossMargin,
    row.operatingMargin,
    row.netIncome,
    row.oneDayMovePct,
    row.fiveDayMovePct,
  ].some((value) => value != null);
  return hasNumber || Boolean(row.guidanceText);
}
