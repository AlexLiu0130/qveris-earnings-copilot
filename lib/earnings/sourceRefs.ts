import type { SourceRef } from "@/lib/earnings/types";

export function uniqueSources(sources: SourceRef[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
}

export function sourceIdsFrom(...items: Array<{ sourceIds?: string[] } | null | undefined>) {
  return [...new Set(items.flatMap((item) => item?.sourceIds ?? []))];
}
