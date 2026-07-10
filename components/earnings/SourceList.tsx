import type { SourceRef } from "@/lib/earnings/types";
import { fmtDateTime } from "@/lib/formatting/format";
import { getDict } from "@/lib/i18n/server";

export async function SourceList({
  sources,
  missing,
  conflicts,
  defaultOpen = false,
}: {
  sources: SourceRef[];
  missing?: string[];
  conflicts?: string[];
  defaultOpen?: boolean;
}) {
  const { lang, t } = await getDict();
  return (
    <details className="sources panel p-4" open={defaultOpen}>
      <summary className="label text-accent">{t.sourceList.title(sources.length)}</summary>
      <ol className="mt-4 space-y-2">
        {sources.map((source, i) => (
          <li key={source.id} className="flex gap-3 text-sm">
            <span className="num shrink-0 text-accent-dim">[{i + 1}]</span>
            <div className="min-w-0">
              <span className="text-ink">
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:decoration-accent">
                    {source.title}
                  </a>
                ) : (
                  source.title
                )}
              </span>
              <p className="num text-xs text-ink-faint">
                {source.provider ?? t.sourceList.providerUnknown}
                {source.capability && lang === "en" ? ` · ${source.capability}` : ""} · {t.sourceList.retrieved}{" "}
                {fmtDateTime(source.retrievedAt)}
              </p>
            </div>
          </li>
        ))}
        {sources.length === 0 && <li className="text-sm text-ink-faint">{t.sourceList.none}</li>}
      </ol>
      {missing && missing.length > 0 && (
        <p className="hairline mt-4 pt-3 text-xs text-ink-soft">
          <span className="label">{t.common.missing}:</span>{" "}
          {missing.map((key) => t.capLabel[key as keyof typeof t.capLabel] ?? key).join(", ")}
        </p>
      )}
      {conflicts && conflicts.length > 0 && (
        <p className="mt-2 text-xs text-conflict">
          <span className="label text-conflict">{t.common.conflicts}:</span> {conflicts.join("; ")}
        </p>
      )}
    </details>
  );
}
