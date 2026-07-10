import type { SourceRef } from "@/lib/earnings/types";

/** Footnote-style citation: renders the 1-based indices of the given source ids
 *  within the analysis source list, e.g. [1,4]. Unknown ids are dropped. */
export function Cite({ ids, sources }: { ids: string[] | undefined; sources: SourceRef[] }) {
  if (!ids?.length) return null;
  const indices = ids
    .map((id) => sources.findIndex((s) => s.id === id) + 1)
    .filter((i) => i > 0);
  if (!indices.length) return null;
  return <sup className="cite">[{[...new Set(indices)].sort((a, b) => a - b).join(",")}]</sup>;
}
