import type { EarningsAnalysis } from "@/lib/earnings/types";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/formatting/format";
import { getDict } from "@/lib/i18n/server";
import { Cite } from "./Cite";
import { ConfidenceBadge } from "./ConfidenceBadge";

export async function TickerEarningsHeader({ analysis }: { analysis: EarningsAnalysis }) {
  const { lang, t } = await getDict();
  const { company, quote, sources } = analysis;
  const event = analysis.recentEvent ?? analysis.upcomingEvent ?? analysis.event;
  const changeTone =
    quote?.changePct == null ? "text-ink-faint" : quote.changePct >= 0 ? "text-beat" : "text-miss";

  const okState = (state?: string) => state === "available" || state === "partial" || state === "demo";
  const pipeline = analysis.eventStatus.map((step) => ({
    label: t.pipeline[step.key],
    state: step.state,
    done: okState(step.state),
  }));

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-5xl text-ink">{analysis.ticker}</h1>
            {analysis.demo && (
              <span className="label border border-demo px-1.5 py-0.5 text-demo">{t.common.demoData}</span>
            )}
          </div>
          <p className="mt-1 text-lg text-ink-soft">
            {company?.name ?? t.header.profileUnavailable}
            {company && <Cite ids={company.sourceIds} sources={sources} />}
          </p>
          <p className="label mt-1">
            {[company?.exchange, company?.sector].filter(Boolean).join(" · ") || t.header.exchangeUnavailable}
            {company?.marketCap != null && ` · ${t.header.mktCap} ${fmtMoney(company.marketCap)}`}
          </p>
          {event && (
            <p className="num mt-2 text-sm text-ink">
              {fmtDate(event.reportDate, lang)}
              {event.fiscalPeriod && ` · ${event.fiscalPeriod}`}
              {event.fiscalYear && ` FY${event.fiscalYear}`} · {t.timing[event.timing]}
              <Cite ids={event.sourceIds} sources={sources} />
            </p>
          )}
        </div>
        <div className="text-right">
          {quote?.price != null ? (
            <>
              <p className="num text-3xl text-ink">
                {fmtMoney(quote.price)}
                <Cite ids={quote.sourceIds} sources={sources} />
              </p>
              <p className={`num text-sm ${changeTone}`}>
                {fmtPct(quote.changePct)}
                {quote.afterHoursChangePct != null && (
                  <span className="ml-2 text-ink-soft">
                    {t.header.ah} {fmtPct(quote.afterHoursChangePct)}
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="label">{t.header.quoteUnavailable}</p>
          )}
          <div className="mt-2">
            <ConfidenceBadge label={analysis.confidence.label} reason={analysis.confidence.reason} />
          </div>
        </div>
      </div>

      {/* event status pipeline — missing stages stay visible, never hidden */}
      <ol className="panel flex flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3">
        {pipeline.map((step, i) => (
          <li key={step.label} className="flex items-center gap-1">
            <span className={`label flex items-center gap-1.5 ${step.state === "conflict" ? "text-conflict" : step.done ? "text-ink" : "text-ink-faint"}`}>
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                  step.state === "conflict" ? "bg-conflict text-white" : step.done ? "bg-accent text-white" : "border border-line-strong text-ink-faint"
                }`}
              >
                {step.state === "conflict" ? "!" : step.done ? "✓" : "·"}
              </span>
              {step.label}
              {!step.done && <span className="normal-case">({step.state === "conflict" ? t.common.conflicts : t.common.unavailable})</span>}
            </span>
            {i < pipeline.length - 1 && <span className="mx-1.5 text-line-strong">→</span>}
          </li>
        ))}
      </ol>
    </header>
  );
}
