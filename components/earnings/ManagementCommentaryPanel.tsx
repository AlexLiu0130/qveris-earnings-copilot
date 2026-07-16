import type { ClaimSourceIds, EarningsAnalysis } from "@/lib/earnings/types";
import { getDict } from "@/lib/i18n/server";
import { Cite } from "./Cite";

export async function ManagementCommentaryPanel({ analysis }: { analysis: EarningsAnalysis }) {
  const { t } = await getDict();
  const { results, transcript, keyDrivers, qualityOfEarnings, riskSignals, sources, claimSourceIds } = analysis;
  const hasNarrative =
    !!results?.guidanceText || (results?.segmentHighlights?.length ?? 0) > 0 || (transcript?.keyQuotes?.length ?? 0) > 0;

  return (
    <section className="panel p-5">
      <h2 className="font-display text-2xl italic text-ink">{t.commentary.title}</h2>

      {hasNarrative ? (
        <div className="mt-4 space-y-5">
          {results?.guidanceText && (
            <div>
              <h3 className="label mb-2 text-accent">{t.flash.guidance}</h3>
              <p className="text-sm leading-relaxed text-ink">
                {results.guidanceText}
                <Cite ids={results.fieldSourceIds?.guidanceText ?? results.sourceIds} sources={sources} />
              </p>
            </div>
          )}

          {results?.segmentHighlights && results.segmentHighlights.length > 0 && (
            <div>
              <h3 className="label mb-2 text-accent">{t.flash.segmentHighlights}</h3>
              <ul className="space-y-1.5">
                {results.segmentHighlights.map((item, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink-soft">
                    <span className="text-accent-dim">—</span>
                    <span>
                      {item}
                      <Cite ids={results.fieldSourceIds?.segmentHighlights ?? results.sourceIds} sources={sources} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {transcript?.available && transcript.keyQuotes && transcript.keyQuotes.length > 0 && (
            <div>
              <h3 className="label mb-3 text-accent">{t.call.keyQuotes}</h3>
              <div className="space-y-3">
                {transcript.keyQuotes.map((quote, i) => (
                  <blockquote key={i} className="border-l-2 border-accent-dim pl-4">
                    <p className="font-display text-lg italic text-ink">“{quote.text}”</p>
                    <cite className="label not-italic">
                      {quote.speaker ?? t.call.speakerUnattributed}
                      <Cite ids={quote.sourceIds} sources={sources} />
                    </cite>
                  </blockquote>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-faint">{t.common.unavailable}</p>
      )}

      <div className="hairline mt-5 pt-4">
        <h3 className="label mb-3 text-accent">{t.commentary.signals}</h3>
        <div className="grid gap-6 md:grid-cols-3">
          <SignalList title={t.drivers.keyDrivers} items={keyDrivers} claimIds={claimSourceIds?.keyDrivers ?? []} sources={sources} marker="▲" markerClass="text-beat" empty={t.drivers.nothingFlagged} />
          <SignalList title={t.drivers.quality} items={qualityOfEarnings} claimIds={claimSourceIds?.qualityOfEarnings ?? []} sources={sources} marker="§" markerClass="text-accent-dim" empty={t.drivers.nothingFlagged} />
          <SignalList title={t.drivers.riskSignals} items={riskSignals} claimIds={claimSourceIds?.riskSignals ?? []} sources={sources} marker="!" markerClass="text-miss" empty={t.drivers.nothingFlagged} />
        </div>
      </div>
    </section>
  );
}

function SignalList({
  title,
  items,
  claimIds,
  sources,
  marker,
  markerClass,
  empty,
}: {
  title: string;
  items: string[];
  claimIds: ClaimSourceIds[];
  sources: EarningsAnalysis["sources"];
  marker: string;
  markerClass: string;
  empty: string;
}) {
  const sourced = items.flatMap((item, index) => {
    const ids = claimIds[index];
    return Array.isArray(ids) && ids.length ? [{ item, ids }] : [];
  });
  return (
    <div>
      <h4 className="label mb-2">{title}</h4>
      {sourced.length ? (
        <ul className="space-y-1.5">
          {sourced.map(({ item, ids }, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-ink-soft">
              <span className={`num shrink-0 ${markerClass}`}>{marker}</span>
              <span>
                {item}
                <Cite ids={ids} sources={sources} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-faint">{empty}</p>
      )}
    </div>
  );
}
