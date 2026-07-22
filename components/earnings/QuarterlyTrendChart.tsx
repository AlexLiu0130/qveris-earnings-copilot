"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { QuarterComparisonRow } from "@/lib/earnings/quarterComparison";
import type { SourceRef } from "@/lib/earnings/types";
import { fmtEps, fmtMoney, fmtPct } from "@/lib/formatting/format";
import { Cite } from "./Cite";

type TrendField = "revenueActual" | "epsActual" | "grossMargin" | "operatingMargin";
type TrendDatum = { period: string; shortPeriod: string; value: number | null; sourceIds: string[] };

const copy = {
  en: { title: "Quarterly trend", sourced: "Sourced actuals only", previous: "vs. prior quarter", unavailable: "No sourced history" },
  zh: { title: "季度趋势", sourced: "仅显示有来源的实际值", previous: "较上季", unavailable: "暂无有来源的历史数据" },
};

const metrics = {
  revenueActual: { en: "Revenue", zh: "营收", color: "var(--color-blue)", format: fmtMoney, axis: compactMoney },
  epsActual: { en: "EPS", zh: "EPS", color: "var(--color-accent)", format: fmtEps, axis: compactNumber },
  grossMargin: { en: "Gross margin", zh: "毛利率", color: "var(--color-amber)", format: formatRatio, axis: formatRatio },
  operatingMargin: { en: "Op. margin", zh: "经营利润率", color: "var(--color-plum)", format: formatRatio, axis: formatRatio },
} satisfies Record<TrendField, { en: string; zh: string; color: string; format: (value: number) => string; axis: (value: number) => string }>;

export function QuarterlyTrendChart({ rows, sources, language }: { rows: QuarterComparisonRow[]; sources: SourceRef[]; language: "en" | "zh" }) {
  const available = (Object.keys(metrics) as TrendField[]).filter((field) => rows.some((row) => sourcedValue(row, field, sources)));
  const [selected, setSelected] = useState<TrendField>(available[0] ?? "revenueActual");
  const field = available.includes(selected) ? selected : available[0];
  if (!field) return null;

  const metric = metrics[field];
  const data = [...rows].reverse().map((row) => datum(row, field, sources));
  const populated = data.filter((item): item is TrendDatum & { value: number } => item.value != null);
  const latest = populated.at(-1);
  const previous = populated.at(-2);
  const delta = latest && previous ? change(field, latest.value, previous.value) : undefined;
  const t = copy[language];

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="font-display text-xl italic text-ink">{t.title}</h3>
          <p className="label mt-1 text-[0.58rem]">{t.sourced}</p>
        </div>
        <div className="flex flex-wrap gap-1 border border-line bg-surface-2 p-1" role="group" aria-label={t.title}>
          {available.map((item) => (
            <button
              key={item}
              type="button"
              data-trend-series={item}
              aria-pressed={field === item}
              onClick={() => setSelected(item)}
              className={`min-h-8 px-3 text-xs transition-colors ${field === item ? "bg-surface text-ink shadow-sm" : "text-ink-faint hover:text-ink"}`}
            >
              {metrics[item][language]}
            </button>
          ))}
        </div>
      </div>

      <figure className="mt-3 min-w-0 border border-line bg-surface px-4 pb-3 pt-4 sm:px-5" data-latest-period={latest?.period} data-point-count={populated.length}>
        <figcaption className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <i className="h-2 w-2 rounded-full" style={{ backgroundColor: metric.color }} />
            <span className="label text-[0.62rem]">{metric[language]}</span>
          </div>
          {latest ? (
            <div className="text-right">
              <div className="num inline-flex items-baseline whitespace-nowrap text-xl text-ink">
                {metric.format(latest.value)}<Cite ids={latest.sourceIds} sources={sources} />
              </div>
              {delta && <p className={`num mt-1 text-xs ${delta.positive ? "text-accent" : "text-ink-faint"}`}>{t.previous} {delta.label}</p>}
            </div>
          ) : <span className="text-sm text-ink-faint">{t.unavailable}</span>}
        </figcaption>

        <div className="h-72 w-full pt-4" role="img" aria-label={`${metric[language]} ${t.title}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 2, left: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 4" />
              <XAxis dataKey="shortPeriod" axisLine={false} tickLine={false} tick={{ fill: "var(--color-ink-faint)", fontSize: 10 }} minTickGap={18} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--color-ink-faint)", fontSize: 10 }} tickFormatter={metric.axis} width={54} domain={["auto", "auto"]} />
              <Tooltip cursor={{ stroke: "var(--color-line-strong)", strokeDasharray: "3 3" }} content={<TrendTooltip label={metric[language]} format={metric.format} />} />
              <Line type="linear" dataKey="value" connectNulls={false} stroke={metric.color} strokeWidth={2.25} dot={{ r: 3, fill: "var(--color-surface)", strokeWidth: 2 }} activeDot={{ r: 5, strokeWidth: 2 }} isAnimationActive animationDuration={450} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}

function TrendTooltip({ active, payload, label, format }: { active?: boolean; payload?: Array<{ value?: number; payload?: TrendDatum }>; label: string; format: (value: number) => string }) {
  const point = payload?.[0];
  if (!active || point?.value == null || !point.payload) return null;
  return (
    <div className="border border-line-strong bg-surface px-3 py-2 shadow-lg">
      <p className="label text-[0.56rem]">{point.payload.period}</p>
      <p className="mt-1 flex items-baseline justify-between gap-5 text-xs text-ink-soft"><span>{label}</span><strong className="num font-medium text-ink">{format(point.value)}</strong></p>
    </div>
  );
}

function datum(row: QuarterComparisonRow, field: TrendField, sources: SourceRef[]): TrendDatum {
  const ids = knownSourceIds(row.fieldSourceIds[field], sources);
  return {
    period: period(row, false),
    shortPeriod: period(row, true),
    value: row[field] != null && ids.length ? row[field] as number : null,
    sourceIds: ids,
  };
}

function sourcedValue(row: QuarterComparisonRow, field: TrendField, sources: SourceRef[]) {
  return row[field] != null && knownSourceIds(row.fieldSourceIds[field], sources).length > 0;
}

function period(row: QuarterComparisonRow, short: boolean) {
  if (!row.fiscalPeriod) return "-";
  if (!row.fiscalYear) return row.fiscalPeriod;
  return `${row.fiscalPeriod} ${short ? String(row.fiscalYear).slice(-2) : row.fiscalYear}`;
}

function knownSourceIds(ids: string[] | undefined, sources: SourceRef[]) {
  const known = new Set(sources.map((source) => source.id));
  return ids?.filter((id) => known.has(id)) ?? [];
}

function change(field: TrendField, latest: number, previous: number) {
  const value = field === "grossMargin" || field === "operatingMargin" ? (latest - previous) * 100 : previous === 0 ? 0 : ((latest - previous) / Math.abs(previous)) * 100;
  const suffix = field === "grossMargin" || field === "operatingMargin" ? "pp" : "%";
  return { positive: value > 0, label: `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}` };
}

function formatRatio(value: number) {
  return fmtPct(value * 100, false);
}

function compactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (absolute >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toFixed(0)}`;
}

function compactNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
