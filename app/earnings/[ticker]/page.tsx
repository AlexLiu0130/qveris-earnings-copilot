import Link from "next/link";
import { analyzeEarnings } from "@/lib/earnings/analyzeEarnings";
import { buildQuarterComparison } from "@/lib/earnings/quarterComparison";
import type { EarningsAnalysis } from "@/lib/earnings/types";
import { buildShareMarkdown } from "@/lib/share/shareCard";
import { listAnalysesByTicker, saveAnalysis } from "@/lib/earnings/analysisStore";
import type { Dict } from "@/lib/i18n/dict";
import { getDict } from "@/lib/i18n/server";
import { CallIntelligencePanel } from "@/components/earnings/CallIntelligencePanel";
import { CopyButton } from "@/components/earnings/CopyButton";
import { EarningsSearchBox } from "@/components/earnings/EarningsSearchBox";
import { KeyMetricsPanel } from "@/components/earnings/KeyMetricsPanel";
import { ManagementCommentaryPanel } from "@/components/earnings/ManagementCommentaryPanel";
import { MultiQuarterPanel } from "@/components/earnings/MultiQuarterPanel";
import { NewsFilingsPanel } from "@/components/earnings/NewsFilingsPanel";
import { SourceList } from "@/components/earnings/SourceList";
import { TickerEarningsHeader } from "@/components/earnings/TickerEarningsHeader";
import { WhatChangedPanel } from "@/components/earnings/WhatChangedPanel";

export const dynamic = "force-dynamic";

export default async function TickerResearchPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const { lang, t } = await getDict();

  const request = {
    ticker: decodeURIComponent(ticker),
    mode: "auto" as const,
    language: lang,
    includeSources: true,
    includeHistoricalPattern: true,
    includeNews: true,
    includeFilings: true,
    includeTranscript: true,
  };
  let analysis;
  try {
    analysis = await analyzeEarnings(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "INVALID_TICKER" || message === "TICKER_NOT_FOUND") {
      return <TickerNotFound ticker={ticker} />;
    }
    throw error;
  }
  await saveAnalysis(request, analysis);
  const savedAnalyses = await listAnalysesByTicker(analysis.ticker, 12);
  const quarterRows = buildQuarterComparison(savedAnalyses, 8);
  const quarterSources = [...new Map(savedAnalyses.flatMap((item) => item.sources).map((source) => [source.id, source])).values()];

  const markdown = buildShareMarkdown(analysis);

  return (
    <div className="space-y-5">
      <div className="rise rise-1">
        <TickerEarningsHeader analysis={analysis} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="space-y-5">
          <div className="rise rise-2">
            <VerdictSection analysis={analysis} t={t} />
          </div>
          <div className="rise rise-3">
            <KeyMetricsPanel analysis={analysis} />
          </div>
          <div className="rise rise-4">
            <MultiQuarterPanel rows={quarterRows} sources={quarterSources} language={analysis.language} />
          </div>
          <div className="rise rise-5 space-y-5">
            <WhatChangedPanel analysis={analysis} />
            <ManagementCommentaryPanel analysis={analysis} />
            <CallIntelligencePanel analysis={analysis} />
          </div>
          <div className="rise rise-6">
            <NewsFilingsPanel analysis={analysis} />
          </div>
        </main>

        <aside className="rise rise-3 space-y-5 lg:sticky lg:top-20 lg:self-start">
          <EvidencePanel analysis={analysis} t={t} />
          <SourceList
            sources={analysis.sources}
            missing={analysis.missing}
            conflicts={analysis.conflicts}
            defaultOpen={false}
          />
        </aside>
      </div>

      <div className="rise rise-6 panel flex flex-wrap items-center gap-3 p-4">
        <span className="label text-accent">{t.ticker.reuse}</span>
        <Link
          href={`/earnings/${analysis.ticker}/share?analysisId=${encodeURIComponent(analysis.analysisId)}`}
          className="label border border-accent px-3 py-1.5 text-accent transition-colors hover:bg-accent hover:text-canvas"
        >
          {t.ticker.sharePage}
        </Link>
        <CopyButton text={markdown} label={t.copy.markdown} copiedLabel={t.copy.copied} />
        <Link
          href="/developers/earnings"
          className="label border border-line-strong px-3 py-1.5 text-ink-soft transition-colors hover:border-accent hover:text-accent"
        >
          {t.ticker.apiCta}
        </Link>
        <span className="ml-auto text-xs text-ink-faint">{t.common.researchDisclaimer}</span>
      </div>
    </div>
  );
}

function EvidencePanel({ analysis, t }: { analysis: EarningsAnalysis; t: Dict }) {
  const visible = [
    "earningsCalendar",
    "estimates",
    "financials",
    "segmentRevenue",
    "filings",
    "transcript",
    "news",
  ];
  const available = visible.filter((key) => analysis.capabilityStatus[key] === "available");
  const missing = analysis.missing.filter((key) => visible.includes(key));

  return (
    <section className="panel p-4">
      <h2 className="label text-accent">{t.common.confidence}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{analysis.confidence.reason}</p>

      <div className="hairline mt-4 pt-4">
        <p className="label mb-2">{t.common.sources}</p>
        <div className="flex flex-wrap gap-1.5">
          {available.map((key) => (
            <span key={key} className="rounded-full border border-beat/25 bg-beat-soft px-2 py-1 text-[11px] text-beat">
              {t.capLabel[key as keyof typeof t.capLabel] ?? key}
            </span>
          ))}
        </div>
      </div>

      <div className="hairline mt-4 pt-4">
        <p className="label mb-2">{t.common.missing}</p>
        {missing.length ? (
          <div className="flex flex-wrap gap-1.5">
            {missing.map((key) => (
              <span key={key} className="rounded-full border border-line-strong px-2 py-1 text-[11px] text-ink-faint">
                {t.capLabel[key as keyof typeof t.capLabel] ?? key}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-faint">{t.common.noCoreGaps}</p>
        )}
      </div>

      <div className="hairline mt-4 pt-4">
        <p className="label mb-2">{t.common.workflow}</p>
        <ol className="space-y-1.5">
          {analysis.eventStatus.map((step) => (
            <li key={step.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-ink-soft">{t.pipeline[step.key]}</span>
              <span className={step.state === "available" ? "text-beat" : "text-ink-faint"}>{t.capState[step.state]}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function VerdictSection({ analysis, t }: { analysis: EarningsAnalysis; t: Dict }) {
  const [verdict, ...rest] = analysis.summaryBullets;
  return (
    <section className="panel border-l-2 border-l-accent p-5">
      <div className="min-w-0">
        <h2 className="label text-accent">{t.verdictSection.title}</h2>
        <p className="mt-2 font-display text-2xl leading-snug text-ink">
          {verdict ?? t.summary.empty}
        </p>
      </div>

      {(rest.length > 0 || analysis.watchNext.length > 0 || analysis.caveats.length > 0) && (
        <details className="sources hairline mt-4 pt-3">
          <summary className="label text-accent">{t.verdictSection.fullSummary}</summary>
          <div className="mt-3 space-y-4">
            {rest.length > 0 && (
              <ul className="space-y-2">
                {rest.map((bullet, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink">
                    <span className="num shrink-0 text-accent">{String(i + 2).padStart(2, "0")}</span>
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
            {analysis.watchNext.length > 0 && (
              <div>
                <h3 className="label mb-2">{t.summary.watchNext}</h3>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {analysis.watchNext.map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-ink-soft">
                      <span className="text-accent-dim">→</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.caveats.length > 0 && (
              <div>
                <h3 className="label mb-2">{t.summary.caveats}</h3>
                <ul className="space-y-1 text-xs text-ink-faint">
                  {analysis.caveats.map((caveat, i) => (
                    <li key={i}>· {caveat}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  );
}

async function TickerNotFound({ ticker }: { ticker: string }) {
  const { t } = await getDict();
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="font-display text-4xl italic text-ink">{t.ticker.notFoundTitle}</p>
      <p className="mt-3 text-ink-soft">
        {t.ticker.notFoundPre}
        <span className="num text-accent">{decodeURIComponent(ticker).toUpperCase()}</span>
        {t.ticker.notFoundPost}
      </p>
      <p className="label mt-2">{t.ticker.demoCoverage}</p>
      <div className="mx-auto mt-6 max-w-sm">
        <EarningsSearchBox placeholder={t.search.placeholder} buttonLabel={t.search.button} />
      </div>
    </div>
  );
}
