import type { EarningsAnalysis } from "@/lib/earnings/types";

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
    bullets: analysis.summaryBullets.slice(0, 5),
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
  return [
    zh ? `# ${card.ticker} 财报研究` : `# ${card.ticker} Earnings ${card.eventType}`,
    "",
    ...card.bullets.map((bullet) => `- ${bullet}`),
    "",
    zh ? `证据质量：${({ high: "高", medium: "中", low: "低" } as const)[card.confidence]}` : `Confidence: ${card.confidence}`,
    zh ? `来源：${card.sourceCount}` : `Sources: ${card.sourceCount}`,
    "",
    zh ? "由 QVeris 提供数据支持。仅供研究参考，不构成投资建议。" : "Powered by QVeris. Research information only, not investment advice.",
  ].join("\n");
}
