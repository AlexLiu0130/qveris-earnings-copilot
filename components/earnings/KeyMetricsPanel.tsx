import type { EarningsAnalysis } from "@/lib/earnings/types";
import { fmtDate, fmtEps, fmtMoney, fmtNumber, fmtPct } from "@/lib/formatting/format";
import { u } from "@/lib/i18n/dict";
import { getDict } from "@/lib/i18n/server";
import { selectFiscalPeriod } from "@/lib/earnings/dataQuality";
import { BeatMissTag } from "./BeatMissTag";
import { Cite } from "./Cite";

/* display-only spread between actual and estimate; the beat/miss verdict
   itself always comes from the API payload */
function surprisePct(actual?: number, estimate?: number): string {
  if (actual == null || estimate == null || estimate === 0) return "unavailable";
  return fmtPct(((actual - estimate) / Math.abs(estimate)) * 100);
}

export async function KeyMetricsPanel({ analysis }: { analysis: EarningsAnalysis }) {
  const { lang, t } = await getDict();
  const { results, estimates, beatMiss, marketReaction, sources } = analysis;
  const currency = analysis.company?.currency ?? "USD";
  const epsCurrency = results?.epsCurrency ?? estimates?.epsCurrency ?? currency;
  const latestFinancials = selectFiscalPeriod(analysis.financials, analysis.event);
  const revenueActual = results?.revenueActual ?? latestFinancials?.revenue;
  const grossMarginRatio = results?.grossMargin ?? latestFinancials?.grossMargin;
  const operatingMarginRatio = results?.operatingMargin ?? latestFinancials?.operatingMargin;
  const grossMargin = grossMarginRatio == null ? undefined : grossMarginRatio * 100;
  const operatingMargin = operatingMarginRatio == null ? undefined : operatingMarginRatio * 100;
  const netIncome = results?.netIncome ?? latestFinancials?.netIncome;
  const revenueIds = results?.fieldSourceIds?.revenueActual ?? latestFinancials?.sourceIds;
  const epsIds = results?.fieldSourceIds?.epsActual ?? results?.sourceIds;
  const marginIds = results?.fieldSourceIds?.grossMargin ?? latestFinancials?.sourceIds;
  const operatingMarginIds = results?.fieldSourceIds?.operatingMargin ?? latestFinancials?.sourceIds;
  const netIncomeIds = results?.fieldSourceIds?.netIncome ?? latestFinancials?.sourceIds;
  const revenueEstimateIds = estimates?.fieldSourceIds?.revenueEstimate ?? estimates?.sourceIds;
  const epsEstimateIds = estimates?.fieldSourceIds?.epsEstimate ?? estimates?.sourceIds;
  const estimateCountIds = estimates?.fieldSourceIds?.estimateCount ?? estimates?.sourceIds;
  const guidanceIds = results?.fieldSourceIds?.guidanceText ?? results?.sourceIds;
  const un = t.common.unavailable;

  return (
    <section className="panel p-5">
      <h2 className="font-display text-2xl italic text-ink">{t.metrics.title}</h2>

      <table className="num mt-4 w-full text-sm">
        <thead>
          <tr className="label text-left">
            <th className="pb-2 font-normal">{t.flash.metric}</th>
            <th className="pb-2 font-normal">{t.flash.actual}</th>
            <th className="pb-2 font-normal">{t.flash.estimate}</th>
            <th className="pb-2 font-normal">{t.metrics.surprise}</th>
            <th className="pb-2 font-normal">{t.flash.verdict}</th>
          </tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-2 [&_td]:pr-3">
          <tr>
            <td className="text-ink-soft">{t.flash.revenue}</td>
            <td className="text-ink">
              {u(fmtMoney(revenueActual, currency), un)}
              {revenueIds && <Cite ids={revenueIds} sources={sources} />}
            </td>
            <td className="text-ink-soft">
              {u(fmtMoney(estimates?.revenueEstimate, currency), un)}
              {revenueEstimateIds && <Cite ids={revenueEstimateIds} sources={sources} />}
              {estimates?.revenueEstimateBasis === "company_guidance_midpoint" && (
                <span className="ml-2 text-[10px] text-ink-faint">
                  {lang === "zh" ? "公司指引中值" : "company guidance midpoint"}
                </span>
              )}
            </td>
            <td className="text-ink-soft">{u(surprisePct(revenueActual, estimates?.revenueEstimate), un)}</td>
            <td>{beatMiss && <BeatMissTag value={beatMiss.revenue} />}</td>
          </tr>
          <tr>
            <td className="text-ink-soft">{t.flash.eps}</td>
            <td className="text-ink">
              {u(fmtEps(results?.epsActual, epsCurrency), un)}
              {epsIds && <Cite ids={epsIds} sources={sources} />}
            </td>
            <td className="text-ink-soft">
              {u(fmtEps(estimates?.epsEstimate, epsCurrency), un)}
              {epsEstimateIds && <Cite ids={epsEstimateIds} sources={sources} />}
            </td>
            <td className="text-ink-soft">{u(surprisePct(results?.epsActual, estimates?.epsEstimate), un)}</td>
            <td>{beatMiss && <BeatMissTag value={beatMiss.eps} />}</td>
          </tr>
          <tr>
            <td className="text-ink-soft">{t.flash.guidance}</td>
            <td colSpan={3} className="max-w-0 text-ink-soft">
              <span className="line-clamp-2">
                {results?.guidanceText ?? un}
                {results?.guidanceText && <Cite ids={guidanceIds} sources={sources} />}
              </span>
            </td>
            <td>{beatMiss && <BeatMissTag value={beatMiss.guidance} />}</td>
          </tr>
        </tbody>
      </table>

      <dl className="hairline mt-4 grid grid-cols-2 gap-4 pt-4 sm:grid-cols-4">
        <Stat
          label={t.flash.grossMargin}
          value={grossMargin == null ? un : `${grossMargin.toFixed(1)}%`}
          ids={marginIds}
          sources={sources}
          un={un}
        />
        <Stat
          label={t.flash.operatingMargin}
          value={operatingMargin == null ? un : `${operatingMargin.toFixed(1)}%`}
          ids={operatingMarginIds}
          sources={sources}
          un={un}
        />
        <Stat label={t.flash.netIncome} value={fmtMoney(netIncome, currency)} ids={netIncomeIds} sources={sources} un={un} />
        <Stat label={t.preview.analystCount} value={fmtNumber(estimates?.estimateCount)} ids={estimateCountIds} sources={sources} un={un} />
      </dl>

      {/* market reaction belongs to the metrics row per the workbench IA */}
      <div className="hairline mt-4 pt-4">
        <h3 className="label mb-3 text-accent">{t.market.title}</h3>
        {marketReaction ? (
          <>
            <p className="mb-3 text-xs text-ink-faint">
              {t.market.reactionSession}: {fmtDate(marketReaction.reactionSessionDate, lang)} · {t.market.reactionBasis[marketReaction.basis]}
              <Cite ids={marketReaction.sourceIds} sources={sources} />
            </p>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label={t.market.baselineClose} value={fmtMoney(marketReaction.baselineClose)} ids={marketReaction.sourceIds} sources={sources} un={un} />
              <Stat label={t.market.openingGap} value={fmtPct(marketReaction.openGapPct)} tone={marketReaction.openGapPct} ids={marketReaction.sourceIds} sources={sources} un={un} />
              <Stat label={t.market.closeReaction} value={fmtPct(marketReaction.closeChangePct)} tone={marketReaction.closeChangePct} ids={marketReaction.sourceIds} sources={sources} un={un} />
              <Stat label={t.market.reactionVolume} value={fmtNumber(marketReaction.volume)} ids={marketReaction.sourceIds} sources={sources} un={un} />
            </dl>
          </>
        ) : (
          <p className="text-sm text-ink-faint">{t.market.reactionUnavailable}</p>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  ids,
  sources,
  un,
}: {
  label: string;
  value: string;
  tone?: number | null;
  ids?: string[];
  sources: EarningsAnalysis["sources"];
  un: string;
}) {
  const isUnavailable = value === "unavailable";
  const toneClass = isUnavailable || tone == null ? "text-ink" : tone >= 0 ? "text-beat" : "text-miss";
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className={`num mt-1 ${isUnavailable ? "text-sm text-ink-faint" : `text-lg ${toneClass}`}`}>
        {u(value, un)}
        {!isUnavailable && ids && <Cite ids={ids} sources={sources} />}
      </dd>
    </div>
  );
}
