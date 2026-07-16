import Link from "next/link";
import { analyzeEarnings } from "@/lib/earnings/analyzeEarnings";
import { buildShareCard, buildShareMarkdown } from "@/lib/share/shareCard";
import { fmtDateTime } from "@/lib/formatting/format";
import { getDict } from "@/lib/i18n/server";
import { CopyButton } from "@/components/earnings/CopyButton";
import { EarningsSearchBox } from "@/components/earnings/EarningsSearchBox";
import { ShareCard } from "@/components/earnings/ShareCard";
import { getAnalysisById, saveAnalysis } from "@/lib/earnings/analysisStore";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ analysisId?: string | string[] }>;
}) {
  const { ticker } = await params;
  const query = await searchParams;
  const { lang, t } = await getDict();

  const analysisId = Array.isArray(query.analysisId) ? query.analysisId[0] : query.analysisId;
  let analysis = analysisId ? await getAnalysisById(analysisId) : null;
  const requestedTicker = decodeURIComponent(ticker).toUpperCase();
  if (analysisId && (!analysis || analysis.ticker !== requestedTicker)) {
    return <ShareNotFound t={t} />;
  }
  try {
    if (!analysis) {
      const request = {
        ticker: requestedTicker,
        mode: "auto",
        language: lang,
        includeTranscript: true,
      } as const;
      analysis = await analyzeEarnings(request);
      await saveAnalysis(request, analysis);
    }
  } catch {
    return <ShareNotFound t={t} />;
  }

  const card = buildShareCard(analysis);
  const markdown = buildShareMarkdown(analysis);
  const imageUrl = `/api/earnings/share-card/image?analysisId=${encodeURIComponent(analysis.analysisId)}&ticker=${encodeURIComponent(analysis.ticker)}&language=${lang}`;
  const topSources = analysis.sources.slice(0, 4);

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-6">
      <div className="rise rise-1">
        <ShareCard card={card} analysis={analysis} />
      </div>

      <div className="rise rise-2 flex flex-wrap items-center gap-3">
        <CopyButton text={markdown} label={t.copy.asMarkdown} copiedLabel={t.copy.copied} />
        <Link
          href={`/earnings/${analysis.ticker}`}
          className="label border border-line-strong px-3 py-1.5 text-ink-soft transition-colors hover:border-accent hover:text-accent"
        >
          {t.share.fullPage}
        </Link>
        <Link
          href={imageUrl}
          target="_blank"
          className="label border border-accent px-3 py-1.5 text-accent transition-colors hover:bg-accent hover:text-white"
        >
          {t.share.image}
        </Link>
        <span className="label ml-auto">
          {t.common.generated} {fmtDateTime(card.generatedAt)}
        </span>
      </div>

      <section className="panel rise rise-3 p-4">
        <h2 className="label mb-3 text-accent">{t.share.behindCard}</h2>
        <ol className="space-y-1.5">
          {topSources.map((source, i) => (
            <li key={source.id} className="flex gap-3 text-sm text-ink-soft">
              <span className="num text-accent-dim">[{i + 1}]</span>
              {source.title}
              <span className="label ml-auto shrink-0">{source.provider ?? ""}</span>
            </li>
          ))}
        </ol>
        {analysis.sources.length > topSources.length && (
          <p className="label mt-3">{t.share.moreSources(analysis.sources.length - topSources.length)}</p>
        )}
      </section>

      <section className="rise rise-4 border border-line p-6 text-center">
        <p className="font-display text-2xl italic text-ink">{t.share.runYourOwn}</p>
        <div className="mx-auto mt-4 max-w-sm">
          <EarningsSearchBox placeholder={t.search.placeholder} buttonLabel={t.search.button} />
        </div>
        <Link href="/developers/earnings" className="label mt-4 inline-block text-accent hover:underline">
          {t.share.buildWith}
        </Link>
      </section>
    </div>
  );
}

function ShareNotFound({ t }: { t: Awaited<ReturnType<typeof getDict>>["t"] }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="font-display text-3xl italic text-ink">{t.share.nothingTitle}</p>
      <p className="mt-3 text-ink-soft">{t.share.nothingBody}</p>
      <div className="mx-auto mt-6 max-w-sm">
        <EarningsSearchBox placeholder={t.search.placeholder} buttonLabel={t.search.button} />
      </div>
    </div>
  );
}
