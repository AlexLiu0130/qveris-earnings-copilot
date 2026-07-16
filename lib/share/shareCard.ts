import type { BeatMiss, EarningsAnalysis, EarningsClaimSourceIds, GuidanceVerdict, SourceRef } from "@/lib/earnings/types";
import { fmtEps, fmtMoney, fmtPct } from "@/lib/formatting/format";

export function buildShareCard(analysis: EarningsAnalysis) {
  const eventType = {
    preview: "Preview",
    flash: "Flash",
    call_intelligence: "Call Intelligence",
    combined: "Combined",
    no_event: "Research Brief",
  }[analysis.mode];

  return {
    ticker: analysis.ticker,
    company: analysis.company?.name ?? analysis.ticker,
    eventType,
    bullets: buildShareSupportingBullets(analysis).slice(0, 5).map((bullet) => bullet.text),
    sourceCount: analysis.sources.length,
    confidence: analysis.confidence.label,
    generatedAt: analysis.generatedAt,
    poweredBy: "QVeris",
    disclaimer: analysis.language === "zh" ? "仅供研究参考，不构成投资建议。" : "Research information only. Not investment advice.",
  };
}

export function buildShareMarkdown(analysis: EarningsAnalysis) {
  const card = buildShareCard(analysis);
  const zh = analysis.language === "zh";
  const metrics = buildShareMetrics(analysis);
  const bullets = buildShareSupportingBullets(analysis).slice(0, 5);
  const sourceLines = analysis.sources.map((source, index) => {
    const title = source.title || source.id;
    const url = source.url ? ` - ${source.url}` : "";
    return `[${index + 1}] ${title}${url}`;
  });
  return [
    zh ? `# ${card.ticker} 财报研究` : `# ${card.ticker} Earnings ${card.eventType}`,
    "",
    buildShareConclusion(analysis),
    "",
    zh ? "## 关键指标" : "## Key metrics",
    zh
      ? `- 营收：${metrics.revenue.actual} / ${metrics.revenue.estimate}${verdictSuffix(metrics.revenue.verdict, zh)}`
      : `- Revenue: ${metrics.revenue.actual} / ${metrics.revenue.estimate}${verdictSuffix(metrics.revenue.verdict, zh)}`,
    `- EPS: ${metrics.eps.actual} / ${metrics.eps.estimate}${verdictSuffix(metrics.eps.verdict, zh)}`,
    zh
      ? `- 收盘反应：${metrics.reaction.value}`
      : `- Close reaction: ${metrics.reaction.value}`,
    zh
      ? `- 指引：${metrics.guidance.value}`
      : `- Guidance: ${metrics.guidance.value}`,
    "",
    ...(bullets.length ? [zh ? "## 有来源要点" : "## Sourced takeaways", ...bullets.map((bullet) => `- ${bullet.text}${citeText(bullet.sourceIds, analysis.sources)}`), ""] : []),
    zh
      ? `证据质量：${({ high: "高", medium: "中", low: "低" } as const)[card.confidence]} - ${analysis.confidence.reason}`
      : `Confidence: ${card.confidence} - ${analysis.confidence.reason}`,
    zh
      ? `Missing: ${analysis.missing.length ? analysis.missing.join(", ") : "none"}`
      : `Missing: ${analysis.missing.length ? analysis.missing.join(", ") : "none"}`,
    "",
    zh ? `来源：${card.sourceCount}` : `Sources: ${card.sourceCount}`,
    ...sourceLines,
    "",
    zh ? "由 QVeris 提供数据支持。仅供研究参考，不构成投资建议。" : "Powered by QVeris. Research information only, not investment advice.",
  ].join("\n");
}

export function buildShareMetrics(analysis: EarningsAnalysis) {
  const revenueActualSourceIds = fieldSourceIds(
    analysis,
    analysis.results?.revenueActual,
    analysis.results?.fieldSourceIds?.revenueActual,
  );
  const revenueEstimateSourceIds = fieldSourceIds(
    analysis,
    analysis.estimates?.revenueEstimate,
    analysis.estimates?.fieldSourceIds?.revenueEstimate,
  );
  const epsActualSourceIds = fieldSourceIds(
    analysis,
    analysis.results?.epsActual,
    analysis.results?.fieldSourceIds?.epsActual,
  );
  const epsEstimateSourceIds = fieldSourceIds(
    analysis,
    analysis.estimates?.epsEstimate,
    analysis.estimates?.fieldSourceIds?.epsEstimate,
  );
  const reactionSourceIds = fieldSourceIds(analysis, analysis.marketReaction?.closeChangePct, analysis.marketReaction?.sourceIds);
  const guidanceSourceIds = fieldSourceIds(
    analysis,
    analysis.results?.guidanceText,
    analysis.results?.fieldSourceIds?.guidanceText,
  );

  return {
    revenue: {
      actual: sourced(fmtMoney(analysis.results?.revenueActual), revenueActualSourceIds),
      estimate: sourced(fmtMoney(analysis.estimates?.revenueEstimate), revenueEstimateSourceIds),
      actualSourceIds: revenueActualSourceIds,
      estimateSourceIds: revenueEstimateSourceIds,
      verdict: revenueActualSourceIds.length && revenueEstimateSourceIds.length ? analysis.beatMiss?.revenue : undefined,
    },
    eps: {
      actual: sourced(fmtEps(analysis.results?.epsActual), epsActualSourceIds),
      estimate: sourced(fmtEps(analysis.estimates?.epsEstimate), epsEstimateSourceIds),
      actualSourceIds: epsActualSourceIds,
      estimateSourceIds: epsEstimateSourceIds,
      verdict: epsActualSourceIds.length && epsEstimateSourceIds.length ? analysis.beatMiss?.eps : undefined,
    },
    reaction: {
      value: sourced(fmtPct(analysis.marketReaction?.closeChangePct), reactionSourceIds),
      sourceIds: reactionSourceIds,
      tone: reactionSourceIds.length ? analysis.marketReaction?.closeChangePct : undefined,
    },
    guidance: {
      value: guidanceSourceIds.length ? verdictLabel(analysis.beatMiss?.guidance, analysis.language === "zh") : "unavailable",
      sourceIds: guidanceSourceIds,
      verdict: guidanceSourceIds.length ? analysis.beatMiss?.guidance : undefined,
    },
  };
}

export function buildShareConclusion(analysis: EarningsAnalysis) {
  const zh = analysis.language === "zh";
  const metrics = buildShareMetrics(analysis);
  const company = analysis.company?.name ?? analysis.ticker;
  if (zh) {
    return `${company}：营收${verdictLabel(metrics.revenue.verdict, true)}，EPS ${verdictLabel(metrics.eps.verdict, true)}，指引${metrics.guidance.value}，财报事件窗口收盘反应 ${metrics.reaction.value}。`;
  }
  return `${company}: revenue ${verdictLabel(metrics.revenue.verdict, false)}, EPS ${verdictLabel(metrics.eps.verdict, false)}, guidance ${metrics.guidance.value}, event-window close reaction ${metrics.reaction.value}.`;
}

export function buildShareSupportingBullets(analysis: EarningsAnalysis) {
  const claims = analysis.claimSourceIds;
  if (!claims) return [];
  const seen = new Set<string>();
  const candidates = [
    ...analysis.summaryBullets.map((text, index) => ({ text, ids: sourceIdsForClaim(claims, "summaryBullets", index) })).filter((item) => item.text !== analysis.oneLineVerdict),
    ...analysis.keyDrivers.map((text, index) => ({ text, ids: sourceIdsForClaim(claims, "keyDrivers", index) })),
    ...analysis.qualityOfEarnings.map((text, index) => ({ text, ids: sourceIdsForClaim(claims, "qualityOfEarnings", index) })),
  ];
  return candidates.flatMap(({ text, ids }) => {
    if (seen.has(text)) return [];
    seen.add(text);
    const sourceIds = sourcedIds(analysis, ids);
    return sourceIds.length ? [{ text, sourceIds }] : [];
  });
}

function fieldSourceIds(analysis: EarningsAnalysis, value: unknown, ids: string[] | undefined) {
  if (value == null || value === "") return [];
  return sourcedIds(analysis, ids);
}

function sourced(value: string, sourceIds: string[]) {
  return sourceIds.length && value !== "unavailable" ? value : "unavailable";
}

function sourcedIds(analysis: EarningsAnalysis, ids: string[] | undefined) {
  if (!ids?.length) return [];
  const known = new Set(analysis.sources.map((source) => source.id));
  return [...new Set(ids)].filter((id) => known.has(id));
}

function sourceIdsForClaim(claims: EarningsClaimSourceIds, section: keyof Omit<EarningsClaimSourceIds, "oneLineVerdict">, index: number): string[] | undefined {
  const sectionIds = claims[section][index];
  return Array.isArray(sectionIds) ? sectionIds : undefined;
}

function verdictSuffix(verdict: BeatMiss | GuidanceVerdict | undefined, zh: boolean) {
  return verdict ? ` (${verdictLabel(verdict, zh)})` : "";
}

function verdictLabel(verdict: BeatMiss | GuidanceVerdict | undefined, zh: boolean) {
  const labels = zh
    ? {
        beat: "超预期",
        miss: "不及预期",
        inline: "符合预期",
        unavailable: "暂无",
        raised: "上调",
        lowered: "下调",
        maintained: "维持",
        provided: "已披露",
      }
    : {
        beat: "beat",
        miss: "miss",
        inline: "inline",
        unavailable: "unavailable",
        raised: "raised",
        lowered: "lowered",
        maintained: "maintained",
        provided: "provided",
      };
  return labels[verdict ?? "unavailable"];
}

function citeText(ids: string[], sources: SourceRef[]) {
  const indices = ids
    .map((id) => sources.findIndex((source) => source.id === id) + 1)
    .filter((index) => index > 0);
  return indices.length ? ` [${[...new Set(indices)].sort((a, b) => a - b).join(",")}]` : "";
}
