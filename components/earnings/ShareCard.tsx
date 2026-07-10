import type { BeatMiss, EarningsAnalysis, GuidanceVerdict } from "@/lib/earnings/types";
import type { buildShareCard } from "@/lib/share/shareCard";
import { fmtDateTime, fmtEps, fmtMoney, fmtPct } from "@/lib/formatting/format";
import { u, type Dict, type Lang } from "@/lib/i18n/dict";
import { getDict } from "@/lib/i18n/server";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { Cite } from "./Cite";

type ShareCardData = ReturnType<typeof buildShareCard>;

/* buildShareCard emits English event types; map back to mode keys for i18n */
const EVENT_MODE: Record<string, "preview" | "flash" | "call_intelligence" | "combined" | "no_event"> = {
  Preview: "preview",
  Flash: "flash",
  "Call Intelligence": "call_intelligence",
  Combined: "combined",
  "Research Brief": "no_event",
};

export async function ShareCard({
  card,
  analysis,
}: {
  card: ShareCardData;
  analysis?: EarningsAnalysis;
}) {
  const { lang, t } = await getDict();
  const modeKey = EVENT_MODE[card.eventType];
  const eventLabel = modeKey ? t.mode[modeKey] : card.eventType;
  const un = t.common.unavailable;
  const conclusion = analysis ? buildShareConclusion(analysis, t, lang) : card.bullets[0];
  const supportingBullets = analysis
    ? [
        ...analysis.summaryBullets.filter((item) => item !== analysis.oneLineVerdict),
        ...analysis.keyDrivers.slice(0, 2),
        ...analysis.qualityOfEarnings.slice(0, 1),
      ].slice(0, 4)
    : card.bullets.slice(1, 5);

  return (
    <article className="relative overflow-hidden border border-accent-dim bg-gradient-to-b from-surface to-canvas p-5 shadow-[0_24px_80px_rgba(31,42,61,0.12)] sm:p-8">
      {/* corner ornaments — audit-stamp feel */}
      <span aria-hidden className="absolute left-2 top-2 h-3 w-3 border-l border-t border-accent" />
      <span aria-hidden className="absolute right-2 top-2 h-3 w-3 border-r border-t border-accent" />
      <span aria-hidden className="absolute bottom-2 left-2 h-3 w-3 border-b border-l border-accent" />
      <span aria-hidden className="absolute bottom-2 right-2 h-3 w-3 border-b border-r border-accent" />

      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <QVerisMark />
            <p className="label text-accent">
              QVeris · {eventLabel} · {t.share.cardKicker}
            </p>
          </div>
          <h1 className="mt-1 font-display text-5xl text-ink">{card.ticker}</h1>
          <p className="mt-1 text-ink-soft">{card.company}</p>
        </div>
        <ConfidenceBadge label={card.confidence} />
      </div>

      {conclusion && (
        <div className="hairline mt-6 pt-5">
          <p className="label text-accent">{t.share.conclusion}</p>
          <p className="mt-2 font-display text-2xl leading-snug text-ink">{conclusion}</p>
        </div>
      )}

      {/* key metrics strip — actuals vs estimates straight from the payload */}
      {analysis && (
        <dl className="mt-5 grid grid-cols-2 gap-4 border border-line bg-surface-2/60 p-4 sm:grid-cols-4">
          <Metric
            label={t.flash.revenue}
            value={`${u(fmtMoney(analysis.results?.revenueActual), un)} / ${u(fmtMoney(analysis.estimates?.revenueEstimate), un)}`}
            sub={`${t.flash.actual} / ${t.flash.estimate}`}
            verdict={analysis.beatMiss?.revenue}
            t={t}
          />
          <Metric
            label={t.flash.eps}
            value={`${u(fmtEps(analysis.results?.epsActual), un)} / ${u(fmtEps(analysis.estimates?.epsEstimate), un)}`}
            sub={`${t.flash.actual} / ${t.flash.estimate}`}
            verdict={analysis.beatMiss?.eps}
            t={t}
          />
          <Metric
            label={t.market.closeReaction}
            value={u(fmtPct(analysis.marketReaction?.closeChangePct), un)}
            tone={analysis.marketReaction?.closeChangePct}
          />
          <Metric
            label={t.flash.guidance}
            value={t.verdict[analysis.beatMiss?.guidance ?? "unavailable"]}
            verdict={analysis.beatMiss?.guidance}
            t={t}
          />
        </dl>
      )}

      {analysis?.results?.guidanceText && (
        <div className="mt-5 border-l-2 border-accent-dim pl-4">
          <p className="label text-accent">{t.share.guidanceSnapshot}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            {analysis.results.guidanceText}
            <Cite ids={analysis.results.fieldSourceIds?.guidanceText ?? analysis.results.sourceIds} sources={analysis.sources} />
          </p>
        </div>
      )}

      {supportingBullets.length > 0 && (
        <div className="mt-5">
          <p className="label mb-2 text-accent">{t.share.keyTakeaways}</p>
          <ul className="space-y-2">
            {supportingBullets.map((bullet, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink">
              <span className="num shrink-0 text-accent">{String(i + 1).padStart(2, "0")}</span>
              {bullet}
            </li>
          ))}
          </ul>
        </div>
      )}

      <div className="hairline mt-6 flex flex-wrap items-center justify-between gap-2 pt-4">
        <p className="label">
          {card.sourceCount} {t.common.sources} · {t.common.generated} {fmtDateTime(card.generatedAt)}
        </p>
        <p className="label text-accent">
          {t.common.poweredBy} {card.poweredBy}
        </p>
      </div>
      <p className="mt-2 text-xs text-ink-faint">{t.common.researchDisclaimer}</p>
    </article>
  );
}

function QVerisMark() {
  return (
    <span aria-label="QVeris" className="shrink-0 whitespace-nowrap">
      <span className="font-display text-2xl italic leading-none text-ink">QVeris</span>
    </span>
  );
}

function buildShareConclusion(analysis: EarningsAnalysis, t: Dict, lang: Lang) {
  const revenue = t.verdict[analysis.beatMiss?.revenue ?? "unavailable"];
  const eps = t.verdict[analysis.beatMiss?.eps ?? "unavailable"];
  const reaction = fmtPct(analysis.marketReaction?.closeChangePct);
  const reactionText = reaction === "unavailable" ? t.common.unavailable : reaction;
  if (lang === "zh") {
    return `${analysis.company?.name ?? analysis.ticker}：营收${revenue}，EPS ${eps}，财报事件窗口收盘反应 ${reactionText}。${analysis.oneLineVerdict}`;
  }
  return `${analysis.company?.name ?? analysis.ticker}: revenue ${revenue}, EPS ${eps}, event-window close reaction ${reactionText}. ${analysis.oneLineVerdict}`;
}

function Metric({
  label,
  value,
  sub,
  tone,
  verdict,
  t,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: number | null;
  verdict?: BeatMiss | GuidanceVerdict;
  t?: Dict;
}) {
  const toneClass = tone == null ? "text-ink" : tone >= 0 ? "text-beat" : "text-miss";
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className={`num mt-1 text-sm ${toneClass}`}>{value}</dd>
      {verdict && t && <dd className="mt-1 text-[10px] text-accent">{t.verdict[verdict] ?? verdict}</dd>}
      {sub && <dd className="text-[10px] text-ink-faint">{sub}</dd>}
    </div>
  );
}
