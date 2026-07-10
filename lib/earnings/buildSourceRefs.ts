import { mockSources } from "@/lib/capabilities/mockData";
import type { SourceRef } from "@/lib/earnings/types";

export function buildSourceRefs(ticker: string, sourceIds: string[]): SourceRef[] {
  const demo = new Map(mockSources(ticker).map((source) => [source.id, source]));
  return [...new Set(sourceIds)].map((id) => {
    const known = demo.get(id);
    if (known) return known;
    return {
      id,
      title: `${ticker.toUpperCase()} source: ${id}`,
      provider: inferProvider(id),
      retrievedAt: new Date().toISOString(),
    };
  });
}

function inferProvider(id: string) {
  if (id.includes("qveris")) return "QVeris";
  if (id.includes("yahoo")) return "Yahoo Finance";
  return "Connected Provider";
}
