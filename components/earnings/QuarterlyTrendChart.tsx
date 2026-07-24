import type { QuarterComparisonRow } from "@/lib/earnings/quarterComparison";
import type { SourceRef } from "@/lib/earnings/types";
import { fmtEps, fmtMoney, fmtPct } from "@/lib/formatting/format";
import { Cite } from "./Cite";

type TrendField = "revenueActual" | "epsActual" | "grossMargin" | "operatingMargin";
type Point = { label: string; value: number; sourceIds: string[] };

const copy = {
  en: { title: "Quarterly trend", sourced: "Sourced actuals only", previous: "vs. prior quarter" },
  zh: { title: "季度趋势", sourced: "仅显示有来源的实际值", previous: "较上季" },
};

const metrics = {
  revenueActual: { en: "Revenue", zh: "营收", color: "var(--color-blue)", format: fmtMoney },
  epsActual: { en: "EPS", zh: "EPS", color: "var(--color-accent)", format: fmtEps },
  grossMargin: { en: "Gross margin", zh: "毛利率", color: "var(--color-amber)", format: formatRatio },
  operatingMargin: { en: "Op. margin", zh: "经营利润率", color: "var(--color-plum)", format: formatRatio },
} satisfies Record<TrendField, { en: string; zh: string; color: string; format: (value: number) => string }>;

export function QuarterlyTrendChart({ rows, sources, language }: { rows: QuarterComparisonRow[]; sources: SourceRef[]; language: "en" | "zh" }) {
  const charts = (Object.keys(metrics) as TrendField[])
    .map((field) => ({ field, points: pointsFor(rows, field, sources) }))
    .filter(({ points }) => points.length > 1);
  if (!charts.length) return null;
  const t = copy[language];

  return (
    <div className="mt-5 border-t border-line pt-5">
      <h3 className="font-display text-xl italic text-ink">{t.title}</h3>
      <p className="label mt-1 text-[0.58rem]">{t.sourced}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {charts.map(({ field, points }) => {
          const metric = metrics[field];
          const latest = points.at(-1)!;
          const previous = points.at(-2)!;
          const delta = change(field, latest.value, previous.value);
          const geometry = chartGeometry(points);
          return (
            <figure
              key={field}
              className="min-w-0 border border-line bg-surface p-4"
              data-trend-series={field}
              data-latest-period={periodLabel(rows, field, sources)}
              data-point-count={points.length}
            >
              <figcaption className="flex items-start justify-between gap-3">
                <span className="label flex items-center gap-2 text-[0.62rem]">
                  <i className="h-2 w-2 rounded-full" style={{ backgroundColor: metric.color }} />
                  {metric[language]}
                </span>
                <span className="text-right">
                  <span className="num inline-flex whitespace-nowrap text-sm text-ink">
                    {metric.format(latest.value)}<Cite ids={latest.sourceIds} sources={sources} />
                  </span>
                  <span className={`num block text-[0.65rem] ${delta.positive ? "text-accent" : "text-ink-faint"}`}>
                    {t.previous} {delta.label}
                  </span>
                </span>
              </figcaption>
              <svg viewBox="0 0 360 150" className="mt-3 block h-36 w-full" role="img" aria-label={`${metric[language]} ${t.title}`}>
                {[28, 72, 116].map((y) => <line key={y} x1="8" x2="352" y1={y} y2={y} stroke="var(--color-line)" />)}
                <polyline points={geometry.path} fill="none" stroke={metric.color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
                {geometry.points.map((point, index) => (
                  <g key={`${point.x}-${point.y}`}>
                    <circle cx={point.x} cy={point.y} r="3.5" fill="var(--color-surface)" stroke={metric.color} strokeWidth="2" />
                    <text x={point.x} y="146" textAnchor="middle" fill="var(--color-ink-faint)" fontSize="8">{points[index].label}</text>
                  </g>
                ))}
              </svg>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

function pointsFor(rows: QuarterComparisonRow[], field: TrendField, sources: SourceRef[]): Point[] {
  const known = new Set(sources.map((source) => source.id));
  return [...rows].reverse().flatMap((row): Point[] => {
    const sourceIds = row.fieldSourceIds[field]?.filter((id) => known.has(id)) ?? [];
    const value = row[field];
    if (value == null || !sourceIds.length) return [];
    const year = row.fiscalYear ? String(row.fiscalYear).slice(-2) : "";
    return [{ label: `${row.fiscalPeriod ?? "-"} ${year}`.trim(), value, sourceIds }];
  });
}

function periodLabel(rows: QuarterComparisonRow[], field: TrendField, sources: SourceRef[]) {
  const known = new Set(sources.map((source) => source.id));
  const row = rows.find((item) => item[field] != null && item.fieldSourceIds[field]?.some((id) => known.has(id)));
  return row ? `${row.fiscalPeriod ?? "-"}${row.fiscalYear ? ` ${row.fiscalYear}` : ""}` : undefined;
}

function chartGeometry(points: Point[]) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const plotted = points.map((point, index) => ({
    x: 12 + index * (336 / Math.max(points.length - 1, 1)),
    y: 122 - ((point.value - min) / span) * 96,
  }));
  return { points: plotted, path: plotted.map(({ x, y }) => `${x},${y}`).join(" ") };
}

function change(field: TrendField, latest: number, previous: number) {
  const value = field === "grossMargin" || field === "operatingMargin"
    ? (latest - previous) * 100
    : previous === 0 ? 0 : ((latest - previous) / Math.abs(previous)) * 100;
  return {
    positive: value > 0,
    label: `${value > 0 ? "+" : ""}${value.toFixed(1)}${field === "grossMargin" || field === "operatingMargin" ? "pp" : "%"}`,
  };
}

function formatRatio(value: number) {
  return fmtPct(value * 100, false);
}
