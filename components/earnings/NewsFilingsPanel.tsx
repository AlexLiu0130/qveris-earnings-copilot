import type { EarningsAnalysis } from "@/lib/earnings/types";
import { fmtDate } from "@/lib/formatting/format";
import { getDict } from "@/lib/i18n/server";
import { Cite } from "./Cite";

export async function NewsFilingsPanel({ analysis }: { analysis: EarningsAnalysis }) {
  const { lang, t } = await getDict();
  const { news, filings, sources } = analysis;

  return (
    <section className="panel p-5">
      <h2 className="font-display text-2xl italic text-ink">{t.newsFilings.title}</h2>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="label mb-2 text-accent">{t.newsFilings.recentNews}</h3>
          {news.length ? (
            <ul className="space-y-3">
              {news.map((item) => (
                <li key={item.id} className="text-sm">
                  <p className="text-ink">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:decoration-accent">
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                    <Cite ids={item.sourceIds} sources={sources} />
                  </p>
                  {item.summary && <p className="mt-0.5 text-xs text-ink-soft">{item.summary}</p>}
                  <p className="label mt-0.5">
                    {item.provider ?? t.newsFilings.providerUnknown} · {fmtDate(item.publishedAt, lang)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-faint">{t.newsFilings.newsUnavailable}</p>
          )}
        </div>
        <div>
          <h3 className="label mb-2 text-accent">{t.newsFilings.secFilings}</h3>
          {filings.length ? (
            <ul className="space-y-3">
              {filings.map((filing) => (
                <li key={filing.id} className="text-sm">
                  <p className="text-ink">
                    <span className="num mr-2 border border-line-strong px-1.5 py-0.5 text-xs text-accent">
                      {filing.formType}
                    </span>
                    {filing.url ? (
                      <a href={filing.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:decoration-accent">
                        {filing.title ?? filing.formType}
                      </a>
                    ) : (
                      filing.title ?? filing.formType
                    )}
                    <Cite ids={filing.sourceIds} sources={sources} />
                  </p>
                  {filing.summary && <p className="mt-0.5 text-xs text-ink-soft">{filing.summary}</p>}
                  <p className="label mt-0.5">
                    {t.newsFilings.filed} {fmtDate(filing.filedAt, lang)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-faint">{t.newsFilings.filingsUnavailable}</p>
          )}
        </div>
      </div>
    </section>
  );
}
