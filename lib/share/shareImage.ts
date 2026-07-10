import type { EarningsAnalysis } from "@/lib/earnings/types";
import { fmtEps, fmtMoney, fmtPct } from "@/lib/formatting/format";

export function buildShareImageSvg(analysis: EarningsAnalysis) {
  const zh = analysis.language === "zh";
  const verdict = zh
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
  const reaction = fmtPct(analysis.marketReaction?.closeChangePct);
  const reactionTag = analysis.marketReaction?.closeChangePct == null
    ? ""
    : analysis.marketReaction.closeChangePct >= 0 ? (zh ? "正向" : "positive") : (zh ? "负向" : "negative");
  const conclusion = zh
    ? `${analysis.company?.name ?? analysis.ticker}：营收${verdict[analysis.beatMiss?.revenue ?? "unavailable"]}，EPS ${verdict[analysis.beatMiss?.eps ?? "unavailable"]}，收盘反应 ${reaction === "unavailable" ? "暂无" : reaction}。`
    : `${analysis.company?.name ?? analysis.ticker}: revenue ${verdict[analysis.beatMiss?.revenue ?? "unavailable"]}, EPS ${verdict[analysis.beatMiss?.eps ?? "unavailable"]}, close reaction ${reaction}.`;
  const takeaways = [
    analysis.results?.guidanceText,
    ...analysis.summaryBullets.filter((item) => item !== analysis.oneLineVerdict),
    ...analysis.keyDrivers,
  ].filter((item): item is string => Boolean(item)).slice(0, 2);
  const sourceLine = zh
    ? `${analysis.sources.length} 个来源 · 证据质量 ${confidenceZh[analysis.confidence.label]} · 仅供研究参考`
    : `${analysis.sources.length} sources · Evidence quality ${analysis.confidence.label} · Research only`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f5f8fc"/>
  <rect x="34" y="34" width="1132" height="562" fill="#ffffff" stroke="#5f9678" stroke-width="2"/>
  <path d="M64 60h42M64 60v42M1136 60h-42M1136 60v42M64 570h42M64 570v-42M1136 570h-42M1136 570v-42" stroke="#0b7a3b" stroke-width="2" fill="none"/>
  <text x="78" y="110" font-size="39" font-style="italic" font-family="Georgia, 'Times New Roman', serif" fill="#1f2a3d">QVeris</text>
  <text x="205" y="99" font-size="16" letter-spacing="4" font-family="SF Mono, ui-monospace, monospace" fill="#0b7a3b">EARNINGS</text>
  <text x="78" y="194" font-size="68" font-family="Georgia, 'Times New Roman', serif" fill="#1f2a3d">${escapeXml(analysis.ticker)}</text>
  <text x="80" y="231" font-size="24" font-family="Inter, Arial, sans-serif" fill="#4a5872">${escapeXml(analysis.company?.name ?? analysis.ticker)}</text>
  <line x1="78" y1="264" x2="1122" y2="264" stroke="#e3ebf5" stroke-width="2"/>
  ${textLines(conclusion, 80, 310, 34, 42, "#1f2a3d", "Georgia, 'Times New Roman', serif", zh ? 21 : 54, 2)}
  <rect x="80" y="372" width="1040" height="92" fill="#eef3f9" stroke="#e3ebf5"/>
  ${metric(108, 404, zh ? "营收" : "Revenue", `${fmtMoney(analysis.results?.revenueActual)} / ${fmtMoney(analysis.estimates?.revenueEstimate)}`, verdict[analysis.beatMiss?.revenue ?? "unavailable"])}
  ${metric(358, 404, "EPS", `${fmtEps(analysis.results?.epsActual)} / ${fmtEps(analysis.estimates?.epsEstimate)}`, verdict[analysis.beatMiss?.eps ?? "unavailable"])}
  ${metric(610, 404, zh ? "收盘反应" : "Close reaction", reaction, reactionTag)}
  ${metric(850, 404, zh ? "指引" : "Guidance", verdict[analysis.beatMiss?.guidance ?? "unavailable"], "")}
  ${takeaways.map((item, index) => textLines(`${String(index + 1).padStart(2, "0")} ${item}`, 82, 506 + index * 31, 21, 25, index === 0 ? "#0b7a3b" : "#4a5872", "Inter, Arial, sans-serif", zh ? 38 : 86, 1)).join("")}
  <line x1="78" y1="552" x2="1122" y2="552" stroke="#e3ebf5" stroke-width="2"/>
  <text x="80" y="580" font-size="15" letter-spacing="2.5" font-family="SF Mono, ui-monospace, monospace" fill="#6b7890">${escapeXml(sourceLine.toUpperCase())}</text>
  <text x="1120" y="580" text-anchor="end" font-size="15" letter-spacing="2.5" font-family="SF Mono, ui-monospace, monospace" fill="#0b7a3b">POWERED BY QVERIS</text>
</svg>`;
}

const confidenceZh = { high: "高", medium: "中", low: "低" } as const;

function metric(x: number, y: number, label: string, value: string, tag: string) {
  const color = tag === "positive" || tag === "正向" || tag === "超预期" || tag === "beat" ? "#0b7a3b" : tag === "negative" || tag === "负向" || tag === "不及预期" || tag === "miss" ? "#d93535" : "#1f2a3d";
  return `<text x="${x}" y="${y}" font-size="14" letter-spacing="2" font-family="SF Mono, ui-monospace, monospace" fill="#6b7890">${escapeXml(label.toUpperCase())}</text>
  <text x="${x}" y="${y + 30}" font-size="23" font-family="SF Mono, ui-monospace, monospace" fill="${color}">${escapeXml(value)}</text>
  <text x="${x}" y="${y + 55}" font-size="13" font-family="SF Mono, ui-monospace, monospace" fill="#6b7890">${escapeXml(tag)}</text>`;
}

function textLines(text: string, x: number, y: number, size: number, lineHeight: number, color: string, family: string, maxChars: number, maxLines = 2) {
  return wrapText(text, maxChars).slice(0, maxLines).map((line, index) =>
    `<text x="${x}" y="${y + index * lineHeight}" font-size="${size}" font-family="${family}" fill="${color}">${escapeXml(line)}</text>`,
  ).join("");
}

function wrapText(text: string, maxChars: number) {
  if (/[\u3400-\u9fff]/.test(text)) {
    const lines: string[] = [];
    for (let index = 0; index < text.length; index += maxChars) lines.push(text.slice(index, index + maxChars));
    return lines;
  }
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (`${current} ${word}`.trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[char] ?? char);
}
