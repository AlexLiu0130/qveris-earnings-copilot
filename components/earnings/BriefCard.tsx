import Link from "next/link";
import type { EarningsAnalysis } from "@/lib/earnings/types";
import { fmtDate } from "@/lib/formatting/format";
import { getDict } from "@/lib/i18n/server";
import { ConfidenceBadge } from "./ConfidenceBadge";

export async function BriefCard({ analysis }: { analysis: EarningsAnalysis }) {
  const { lang, t } = await getDict();
  const event = analysis.recentEvent ?? analysis.upcomingEvent ?? analysis.event;
  const reported = event?.status === "reported";

  return (
    <Link
      href={`/earnings/${analysis.ticker}`}
      className="panel group flex h-full flex-col p-4 transition-colors hover:border-accent-dim"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-lg text-ink group-hover:text-accent">{analysis.ticker}</span>
        <span
          className={`label rounded-sm px-1.5 py-0.5 ${reported ? "bg-beat-soft text-beat" : "bg-accent-soft text-accent"}`}
        >
          {t.mode[analysis.mode]}
        </span>
      </div>
      {event && (
        <p className="num mt-1 text-xs text-ink-soft">
          {fmtDate(event.reportDate, lang)}
          {event.fiscalPeriod && ` · ${event.fiscalPeriod}`}
        </p>
      )}
      <p className="mt-3 line-clamp-2 flex-1 text-sm leading-snug text-ink-soft">
        {analysis.summaryBullets[0] ?? t.summary.empty}
      </p>
      <div className="hairline mt-3 flex items-center justify-between pt-3">
        <ConfidenceBadge label={analysis.confidence.label} reason={analysis.confidence.reason} />
        {analysis.demo && <span className="label">{t.common.demo}</span>}
      </div>
    </Link>
  );
}
