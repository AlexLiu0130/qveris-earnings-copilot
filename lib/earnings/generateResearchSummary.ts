import type { EarningsAnalysis } from "@/lib/earnings/types";
import { selectFiscalPeriod } from "@/lib/earnings/dataQuality";
import type { Lang } from "@/lib/i18n/dict";

export function generateResearchSummary(input: Pick<
  EarningsAnalysis,
  "mode" | "event" | "company" | "estimates" | "results" | "beatMiss" | "historicalSummary" | "transcript" | "news" | "filings"
  | "financials" | "segmentRevenue"
>, lang: Lang = "en") {
  const zh = lang === "zh";
  const name = input.company?.name ?? input.company?.ticker ?? "The company";
  const bullets: string[] = [];
  const drivers: string[] = [];
  const risks: string[] = [];
  const quality: string[] = [];
  const watchNext: string[] = [];

  if (input.mode === "preview" || input.mode === "combined") {
    bullets.push(zh ? `${name} 即将发布财报，应结合一致预期和近期背景评估财报前情景。` : `${name} has an upcoming earnings event; the setup should be read against consensus estimates and recent context.`);
    if (input.estimates?.revenueEstimate != null) bullets.push(zh ? "已取得营收一致预期，财报发布后应以同一事件口径比较实际营收。" : "Revenue estimate is available from connected sources; compare actual revenue against this baseline when results arrive.");
    if (input.estimates?.epsEstimate != null) bullets.push(zh ? "已取得 EPS 一致预期，解读预期差时还需结合利润率和业绩指引。" : "EPS estimate is available; EPS surprise should be interpreted alongside margins and guidance.");
    watchNext.push(zh ? "重点观察业绩指引的变化是否比表面上的超预期或不及预期更重要。" : "Watch whether guidance changes more than the headline beat/miss.");
  }

  if (input.mode === "flash" || input.mode === "combined") {
    const rev = input.beatMiss?.revenue ?? "unavailable";
    const eps = input.beatMiss?.eps ?? "unavailable";
    const verdict = (value: string) => zh ? ({ beat: "超预期", miss: "不及预期", inline: "符合预期", unavailable: "暂无" }[value] ?? value) : value;
    bullets.push(zh ? `${name} 已发布财报，营收${verdict(rev)}，EPS ${verdict(eps)}。` : `${name} recently reported earnings; revenue status is ${rev} and EPS status is ${eps} versus available estimates.`);
    if (input.results?.guidanceText) bullets.push(zh ? "管理层业绩指引已披露，是解读财报后走势的核心变量。" : "Guidance commentary is available and should be treated as a primary driver of post-earnings interpretation.");
    drivers.push(zh ? "实际业绩相对一致预期的差异。" : "Actual results versus consensus estimates.");
    drivers.push(zh ? "业绩指引措辞以及分部或关键指标的变化。" : "Guidance language and any segment/KPI changes.");
  }

  if (input.historicalSummary.limitedHistory) {
    bullets.push(zh ? "历史样本有限，本次判断应更多依赖当前来源，而不是历史超预期率。" : "Historical pattern is limited, so confidence should rely more on current sources than beat-rate history.");
  } else {
    const parts = [];
    if (input.historicalSummary.epsDataPoints > 0) parts.push(zh ? `${input.historicalSummary.epsDataPoints} 个 EPS 季度` : `${input.historicalSummary.epsDataPoints} EPS quarters`);
    if (input.historicalSummary.revenueDataPoints > 0) parts.push(zh ? `${input.historicalSummary.revenueDataPoints} 个营收季度` : `${input.historicalSummary.revenueDataPoints} revenue quarters`);
    bullets.push(parts.length
      ? (zh ? `历史数据包含 ${parts.join(" 和 ")}，可用于理解预期差背景。` : `Historical dataset includes ${parts.join(" and ")} for beat/miss context.`)
      : (zh ? `历史数据包含 ${input.historicalSummary.quarters} 次事件，但可用于计算预期差的数据有限。` : `Historical dataset includes ${input.historicalSummary.quarters} events, but beat/miss inputs are limited.`));
  }

  if (!input.transcript?.available) {
    risks.push(zh ? "电话会记录暂无或仍待更新，因此无法完整判断管理层语气和问答压力。" : "Transcript-derived management tone and Q&A pressure are unavailable or pending.");
    watchNext.push(zh ? "电话会记录可用后复核管理层表述和分析师追问。" : "Review the earnings call transcript when available.");
  } else {
    drivers.push(zh ? "电话会中的管理层语气和分析师追问压力。" : "Management tone and analyst Q&A pressure from the earnings call.");
  }

  if (input.news.length > 0) drivers.push(zh ? "近期新闻背景可能影响市场预期和持仓结构。" : "Recent news context may affect expectations and positioning.");
  const latestFinancials = selectFiscalPeriod(input.financials, input.event);
  if (latestFinancials?.grossMargin != null) quality.push(zh ? `季度财务报表显示本季毛利率为 ${(latestFinancials.grossMargin * 100).toFixed(1)}%。` : `Latest gross margin is available from quarterly financial statements: ${(latestFinancials.grossMargin * 100).toFixed(1)}%.`);
  if (latestFinancials?.freeCashFlow != null && latestFinancials?.netIncome != null) {
    const conversion = latestFinancials.netIncome ? latestFinancials.freeCashFlow / latestFinancials.netIncome : undefined;
    if (conversion != null) quality.push(zh ? `本季自由现金流相当于净利润的 ${(conversion * 100).toFixed(0)}%。` : `Free-cash-flow conversion is available for the latest quarter: ${(conversion * 100).toFixed(0)}% of net income.`);
  }
  if (latestFinancials?.inventory != null || latestFinancials?.accountsReceivable != null) quality.push(zh ? "可使用资产负债表中的库存和应收账款数据进行质量核查。" : "Balance-sheet fields are available for inventory and receivables checks.");
  if (input.results?.segmentHighlights?.length) drivers.push(zh ? "已取得与本次财报期间匹配的分部收入。" : "Event-matched segment revenue is available.");
  if (input.filings.length > 0) quality.push(zh ? "可使用公司公告交叉核验财报中的关键陈述。" : "Filing context is available for cross-checking company-reported claims.");

  quality.push(zh ? "需要区分经营改善与一次性项目、回购、税务影响及会计变化。" : "Separate operating improvements from one-time items, buybacks, tax effects, and accounting changes.");
  risks.push(zh ? "市场反应不仅取决于表面预期差，还可能受到预期、持仓、估值和业绩指引影响。" : "Market reaction may reflect expectations, positioning, valuation, and guidance rather than headline beat/miss alone.");
  watchNext.push(zh ? "持续跟踪下一季度指引、利润率趋势和分部关键指标。" : "Track next-quarter guidance, margin trajectory, and segment-level KPIs.");

  return {
    summaryBullets: uniq(bullets).slice(0, 8),
    keyDrivers: uniq(drivers).slice(0, 5),
    riskSignals: uniq(risks).slice(0, 5),
    qualityOfEarnings: uniq(quality).slice(0, 5),
    watchNext: uniq(watchNext).slice(0, 5),
  };
}

function uniq(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
