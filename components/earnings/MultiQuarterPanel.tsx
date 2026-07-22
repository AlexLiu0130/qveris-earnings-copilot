import type { QuarterComparisonField, QuarterComparisonRow } from "@/lib/earnings/quarterComparison";
import type { SourceRef } from "@/lib/earnings/types";
import { fmtDate, fmtEps, fmtMoney, fmtPct } from "@/lib/formatting/format";
import { u } from "@/lib/i18n/dict";
import { Cite } from "./Cite";
import { QuarterlyTrendChart } from "./QuarterlyTrendChart";

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
    <section className="panel min-w-0 overflow-hidden p-5">
      <h2 className="font-display text-2xl italic text-ink">{t.title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-faint">{t.empty}</p>
      ) : (
        <>
          <div className="mt-4 max-w-full overflow-x-auto">
            <table className="num w-full min-w-[900px] table-fixed text-sm">
            <colgroup>
              <col className="w-[76px]" />
              <col className="w-[118px]" />
              <col className="w-[184px]" />
              <col className="w-[156px]" />
              <col className="w-[104px]" />
              <col className="w-[120px]" />
              <col className="w-[142px]" />
            </colgroup>
            <thead>
              <tr className="label text-left">
                <th className="pb-2 pr-4 font-normal">{t.period}</th>
                <th className="pb-2 pr-4 font-normal">{t.reported}</th>
                <th className="pb-2 pr-4 font-normal">{t.revenue}</th>
                <th className="pb-2 pr-4 font-normal">{t.eps}</th>
                <th className="pb-2 pr-4 font-normal">{t.grossMargin}</th>
                <th className="pb-2 pr-4 font-normal">{t.operatingMargin}</th>
                <th className="pb-2 pr-4 font-normal">{t.netIncome}</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top">
              {rows.map((row) => (
                <tr key={`${row.analysisId}:${row.eventKey}`}>
                  <td className="whitespace-nowrap text-ink">{row.fiscalPeriod ?? "-"}</td>
                  <td className="whitespace-nowrap text-ink-soft">{u(fmtDate(row.reportDate, language), un)}</td>
                  <td className="text-ink-soft">{metric(t.actual, sourced(fmtMoney(row.revenueActual), ids(row, "revenueActual"), un, sources), t.estimate, sourced(fmtMoney(row.revenueEstimate), ids(row, "revenueEstimate"), un, sources), t.surprise, sourced(fmtPct(row.revenueSurprisePct), surpriseIds(row, "revenueActual", "revenueEstimate"), un, sources))}</td>
                  <td className="text-ink-soft">{metric(t.actual, sourced(fmtEps(row.epsActual), ids(row, "epsActual"), un, sources), t.estimate, sourced(fmtEps(row.epsEstimate), ids(row, "epsEstimate"), un, sources), t.surprise, sourced(fmtPct(row.epsSurprisePct), surpriseIds(row, "epsActual", "epsEstimate"), un, sources))}</td>
                  <td className="whitespace-nowrap text-ink-soft">{ratio(row.grossMargin, ids(row, "grossMargin"), un, sources)}</td>
                  <td className="whitespace-nowrap text-ink-soft">{ratio(row.operatingMargin, ids(row, "operatingMargin"), un, sources)}</td>
                  <td className="whitespace-nowrap text-ink-soft">{sourced(fmtMoney(row.netIncome), ids(row, "netIncome"), un, sources)}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <QuarterlyTrendChart rows={rows} sources={sources} language={language} />
        </>
      )}
    </section>
  );
}

function metric(actualLabel: string, actual: React.ReactNode, estimateLabel: string, estimate: React.ReactNode, surpriseLabel: string, surprise: React.ReactNode) {
  return (
    <div className="grid gap-0.5 text-xs leading-5">
      <span className="whitespace-nowrap">{actualLabel}: {actual}</span>
      <span className="whitespace-nowrap">{estimateLabel}: {estimate}</span>
      <span className="whitespace-nowrap">{surpriseLabel}: {surprise}</span>
    </div>
  );
}

function ratio(value: number | undefined, sourceIds: string[] | undefined, un: string, sources: SourceRef[]) {
  return value == null ? un : sourced(fmtPct(value * 100, false), sourceIds, un, sources);
}

function sourced(value: string, sourceIds: string[] | undefined, un: string, sources: SourceRef[]) {
  const knownIds = knownSourceIds(sourceIds, sources);
  if (!knownIds.length) return un;
  return (
    <span className="inline-flex items-baseline whitespace-nowrap gap-px">
      {u(value, un)}
      <Cite ids={knownIds} sources={sources} />
    </span>
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

function knownSourceIds(sourceIds: string[] | undefined, sources: SourceRef[]) {
  const known = new Set(sources.map((source) => source.id));
  return sourceIds?.filter((id) => known.has(id)) ?? [];
}
