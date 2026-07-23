import { aiRuntimeConfig, localEnv } from "@/lib/runtime/env";
import { computeBeatMiss } from "@/lib/earnings/computeBeatMiss";
import type { AiInterpretation, ClaimSourceIds, EarningsAnalysis, EarningsInterpretationClaim, EarningsInterpretationEdge } from "@/lib/earnings/types";

type InterpretationInput = Pick<EarningsAnalysis,
  | "ticker"
  | "language"
  | "mode"
  | "company"
  | "event"
  | "estimates"
  | "results"
  | "financials"
  | "segmentRevenue"
  | "news"
  | "filings"
  | "transcript"
  | "sources"
> & Partial<Pick<EarningsAnalysis, "missing" | "conflicts" | "capabilityStatus">>;

type RawClaim = {
  text?: unknown;
  evidenceType?: unknown;
  sourceIds?: unknown;
  confidence?: unknown;
  rationale?: unknown;
  counterEvidence?: unknown;
  nextEvidence?: unknown;
  lag?: unknown;
};
type RawEdge = RawClaim & { from?: unknown; to?: unknown; relation?: unknown; lag?: unknown };
type RawInterpretation = {
  mode?: unknown;
  role?: unknown;
  archetype?: unknown;
  conclusion?: RawClaim;
  companyDrivers?: RawClaim[];
  transmissionChain?: RawEdge[];
  counterEvidence?: RawClaim[];
  watchItems?: RawClaim[];
  confidence?: unknown;
};

type AgentRoute = {
  role: NonNullable<AiInterpretation["role"]>;
  ecosystemSourceIds: Set<string>;
  allowedNodes: string[];
  rationale: string;
};

type ValidationContext = {
  knownSourceIds: Set<string>;
  ecosystemSourceIds: Set<string>;
  evidenceText: string;
  evidenceBySourceId: Map<string, string>;
  ticker: string;
  language: "en" | "zh";
  allowedProperNouns: Set<string>;
  allowedNodes: Set<string>;
  hasRevenueEstimate: boolean;
  hasEpsEstimate: boolean;
  role: AgentRoute["role"];
};

const platformPattern = /\b(ai|platform|hyperscaler|infrastructure|data cent(?:er|re)|cloud)\b|人工智能|平台|超大规模|基础设施|数据中心|云/i;
const investmentPattern = /\b(capex|capital expenditure|capacity|deployment|buildout|procurement)\b|资本开支|产能|部署|扩建|采购/i;
const memoryProductPattern = /\b(HBM\d*E?|DRAM|NAND|memory|semiconductor|wafer|bit shipment|data[- ]center)\b|高带宽内存|存储|半导体|晶圆|位元出货|数据中心/i;
const memoryDemandPattern = /\b(AI|server|accelerator|customer|demand|pricing|mix|shipment|supply)\b|人工智能|服务器|加速器|客户|需求|定价|组合|出货|供给/i;
const prohibitedPattern = /\b(buy|sell|hold|price target|overweight|underweight)\b|买入|卖出|持有|目标价|加仓|减仓/i;
export const EARNINGS_INTERPRETATION_CONTRACT_VERSION = "earnings_research_agent_v2";

export function isCurrentInterpretation(interpretation: AiInterpretation | undefined) {
  return interpretation?.agent?.contractVersion === EARNINGS_INTERPRETATION_CONTRACT_VERSION;
}

export async function generateAiInterpretation(input: InterpretationInput): Promise<AiInterpretation> {
  if (input.mode === "no_event" && !input.event && !input.results) {
    return unavailable("AI_INTERPRETATION_EVIDENCE_INSUFFICIENT");
  }
  const env = localEnv();
  const ai = aiRuntimeConfig(env);
  if (!ai) return unavailable("AI_INTERPRETATION_UNAVAILABLE");
  const knownSourceIds = new Set(input.sources.map((source) => source.id));
  if (!knownSourceIds.size || !hasCitableEventEvidence(input, knownSourceIds)) {
    return unavailable("AI_INTERPRETATION_EVIDENCE_INSUFFICIENT");
  }
  const { route, prompt } = buildInterpretationAgentInput(input, knownSourceIds);
  const baseUrl = ai.baseUrl;

  for (let attempt = 0; attempt < 1; attempt += 1) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ai.apiKey}` },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        model: ai.model,
        temperature: 0,
        max_tokens: 2_600,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are the research stage of QVeris Earnings Research Agent. Return one compact JSON object with keys mode, role, archetype, conclusion, companyDrivers, transmissionChain, counterEvidence, watchItems, confidence. conclusion MUST be a claim object, never a string. A claim is a flat object {text,evidenceType,sourceIds,confidence,rationale?,counterEvidence?,nextEvidence?,lag?}; evidenceType is fact, inference, or to_verify. An edge is also flat: {from,to,relation,lag,text,evidenceType,sourceIds,confidence}; never nest a claim object. Use only supplied evidence and sourceIds. Conclusion, facts, drivers, counter-evidence, watch items, and edges require valid sourceIds. Do not give investment advice, price targets, or name external beneficiary companies. Every edge from/to pair must exactly match one ordered pair in allowedTransmissionEdges; never reverse or skip nodes. Use mode ecosystem only when ecosystemEligibleSourceIds is non-empty, and every transmission edge must cite at least one of those eligible IDs; otherwise use company with an empty transmissionChain. " +
              "Keep every text field under 120 Chinese characters or 220 English characters. Return at most 3 companyDrivers, 2 counterEvidence items, 3 watchItems, and 3 transmission edges. Distinguish reported facts from conditional inference. The deterministic layer already renders all metrics: do not include any number, percentage, date, currency amount, beat/miss calculation, or historical-record claim in narrative text. Focus on operating mechanism, why it matters, counter-evidence, and next validation. Cite the sourceIds attached to the exact evidence object supporting each claim; a company profile cannot support an operating claim. Exclude news opinions that contain investment recommendations. " +
              "Never describe revenue as beating or missing expectations unless estimates.revenueEstimate exists. Never describe EPS as beating or missing expectations unless estimates.epsEstimate exists. Company guidance is not analyst consensus; name it as company guidance. " +
              "Use validatedSignals as the preferred numeric evidence. Do not derive or calculate any other numeric value. " +
              (input.language === "zh" ? "Write all narrative text in Simplified Chinese." : "Write all narrative text in English."),
          },
          { role: "user", content: JSON.stringify(prompt) },
        ],
      }),
      });
      if (!res.ok) {
        console.warn("AI interpretation request failed", { status: res.status, model: ai.model, provider: ai.provider });
        return deterministicFallback(input, "AI_INTERPRETATION_UNAVAILABLE", route);
      }
      const payload = await res.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        return deterministicFallback(input, "AI_INTERPRETATION_UNAVAILABLE", route);
      }
      const result = normalize(parseJsonContent(content), {
        knownSourceIds,
        ecosystemSourceIds: route.ecosystemSourceIds,
        evidenceText: JSON.stringify(prompt),
        evidenceBySourceId: evidenceBySourceId(input),
        ticker: input.ticker,
        language: input.language,
        allowedProperNouns: allowedProperNouns(input),
        allowedNodes: new Set(route.allowedNodes),
        hasRevenueEstimate: input.estimates?.revenueEstimate != null,
        hasEpsEstimate: input.estimates?.epsEstimate != null,
        role: route.role,
      }, input.language, input, route);
      return result.status === "unavailable"
        ? deterministicFallback(input, result.reason ?? "AI_INTERPRETATION_INVALID", route)
        : enrichInterpretation(result, input, route);
    } catch (error) {
      console.warn("AI interpretation processing failed", { error: error instanceof Error ? error.name : "UnknownError", provider: ai.provider });
      return deterministicFallback(input, "AI_INTERPRETATION_UNAVAILABLE", route);
    }
  }
  return deterministicFallback(input, "AI_INTERPRETATION_UNAVAILABLE", route);
}

export function buildInterpretationAgentInput(input: InterpretationInput, known = new Set(input.sources.map((source) => source.id))) {
  const route = routeAgent(input, known);
  return { route, prompt: promptInput(input, route) };
}

function deterministicFallback(input: InterpretationInput, reason: string, route?: AgentRoute): AiInterpretation {
  if (!input.results || !input.event) return unavailable(reason);
  const known = new Set(input.sources.map((source) => source.id));
  const ids = (...groups: Array<string[] | undefined>) => [...new Set(groups.flatMap((group) => group ?? []).filter((id) => known.has(id)))];
  const resultIds = ids(input.results.sourceIds, input.event.sourceIds);
  if (!resultIds.length) return unavailable(reason);
  const verdicts = computeBeatMiss(input.results, input.estimates);
  const zh = input.language === "zh";
  const label = (value: string) => zh
    ? ({ beat: "超出可用预期", miss: "低于可用预期", inline: "基本符合可用预期", unavailable: "缺少同口径预期" }[value] ?? value)
    : ({ beat: "above available consensus", miss: "below available consensus", inline: "in line with available consensus", unavailable: "missing a comparable estimate" }[value] ?? value);
  const parts: string[] = [];
  const companyDrivers: EarningsInterpretationClaim[] = [];
  if (input.results.revenueActual != null) {
    parts.push(zh ? `营收${label(verdicts.revenue)}` : `revenue is ${label(verdicts.revenue)}`);
    companyDrivers.push({
      text: zh ? `本期营收${label(verdicts.revenue)}。` : `Reported revenue is ${label(verdicts.revenue)}.`,
      evidenceType: "inference",
      sourceIds: ids(input.results.fieldSourceIds?.revenueActual, input.estimates?.fieldSourceIds?.revenueEstimate, resultIds),
      confidence: "medium",
    });
  }
  if (input.results.epsActual != null) {
    parts.push(zh ? `EPS ${label(verdicts.eps)}` : `EPS is ${label(verdicts.eps)}`);
    companyDrivers.push({
      text: zh ? `本期 EPS ${label(verdicts.eps)}。` : `Reported EPS is ${label(verdicts.eps)}.`,
      evidenceType: "inference",
      sourceIds: ids(input.results.fieldSourceIds?.epsActual, input.estimates?.fieldSourceIds?.epsEstimate, resultIds),
      confidence: "medium",
    });
  }
  if (!parts.length) return unavailable(reason);
  if (input.results.guidanceText) {
    companyDrivers.push({
      text: zh ? "管理层已披露业绩指引，后续应以实际兑现情况复核。" : "Management guidance is available and should be checked against subsequent results.",
      evidenceType: "inference",
      sourceIds: ids(input.results.fieldSourceIds?.guidanceText, input.results.sourceIds),
      confidence: "medium",
    });
  }
  const counterEvidence: EarningsInterpretationClaim[] = [];
  const guidanceIdsForCounter = ids(input.results.fieldSourceIds?.guidanceText, input.results.sourceIds, input.transcript?.sourceIds);
  if (input.results.guidanceText && guidanceIdsForCounter.length) {
    counterEvidence.push({
      text: zh ? "管理层指引、长期协议或客户承诺并不等同于已确认收入，价格条款与兑现节奏可能改变最终利润率。" : "Management guidance, long-term agreements, or customer commitments are not recognized revenue; pricing terms and delivery timing can change realized margins.",
      evidenceType: "inference",
      sourceIds: guidanceIdsForCounter,
      confidence: "low",
      counterEvidence: zh ? "若后续公司文件确认收入确认节奏、定价与毛利率同步兑现，这一保留意见将减弱。" : "This reservation weakens if subsequent company materials confirm aligned revenue timing, pricing, and margin delivery.",
      nextEvidence: zh ? "后续监管文件中的合同负债、RPO、收入确认与价格条款。" : "Contract liabilities, RPO, revenue recognition, and pricing terms in subsequent filings.",
    });
  }
  if (!input.estimates?.revenueEstimate || !input.estimates?.epsEstimate) {
    counterEvidence.push({
      text: zh ? "当前快照缺少至少一项同口径市场预期，不能据此完整判断营收与 EPS 的预期差。" : "The snapshot lacks at least one comparable consensus estimate, so the full revenue and EPS surprise cannot be established.",
      evidenceType: "to_verify",
      sourceIds: resultIds,
      confidence: "low",
      nextEvidence: zh ? "补充与本次财报事件同口径的分析师一致预期。" : "Obtain same-event analyst consensus estimates.",
    });
  }
  if ((input.conflicts?.length ?? 0) > 0) {
    counterEvidence.push({
      text: zh ? "当前快照记录了来源冲突，关键数字和口径仍需回到公司公告复核。" : "The snapshot records source conflicts; key figures and definitions require verification against company materials.",
      evidenceType: "to_verify",
      sourceIds: resultIds,
      confidence: "low",
      nextEvidence: zh ? "核对公司公告、监管文件与电话会原文。" : "Reconcile the company release, filing, and call transcript.",
    });
  }
  const watchItems: EarningsInterpretationClaim[] = [];
  const guidanceIds = ids(input.results.fieldSourceIds?.guidanceText, input.results.sourceIds);
  if (input.results.guidanceText && guidanceIds.length) {
    watchItems.push({
      text: zh ? "下一次财报应核对管理层指引是否兑现，以及兑现依赖的收入与利润率条件是否变化。" : "At the next report, verify whether management guidance was delivered and whether its revenue and margin assumptions changed.",
      evidenceType: "to_verify",
      sourceIds: guidanceIds,
      confidence: "low",
      lag: zh ? "下一财季" : "next quarter",
      nextEvidence: zh ? "下一季公司业绩、指引与电话会。" : "Next-quarter results, guidance, and earnings call.",
    });
  }
  const currentFinancial = input.financials[0];
  if (currentFinancial) {
    const financialIds = ids(currentFinancial.sourceIds);
    if (financialIds.length && currentFinancial.grossMargin != null) {
      watchItems.push({
        text: zh ? "后续应观察毛利率能否延续当前水平，并与产品组合、定价及供给变化交叉验证。" : "Track whether gross margin sustains its current level and cross-check it against product mix, pricing, and supply changes.",
        evidenceType: "to_verify",
        sourceIds: financialIds,
        confidence: "low",
        lag: zh ? "未来 1–2 个季度" : "next 1–2 quarters",
        nextEvidence: zh ? "后续季度毛利率及管理层解释。" : "Subsequent quarterly gross margin and management explanation.",
      });
    }
    if (financialIds.length && (currentFinancial.inventory != null || currentFinancial.capitalExpenditure != null)) {
      watchItems.push({
        text: zh ? "库存与资本开支的变化将帮助判断供需、产能纪律和利润率改善是否具有持续性。" : "Changes in inventory and capital expenditure will help test supply-demand conditions, capacity discipline, and margin durability.",
        evidenceType: "to_verify",
        sourceIds: financialIds,
        confidence: "low",
        lag: zh ? "未来 1–2 个季度" : "next 1–2 quarters",
        nextEvidence: zh ? "资产负债表、现金流量表和管理层产能表述。" : "Balance sheet, cash flow statement, and management capacity commentary.",
      });
    }
  }
  const previousFinancial = input.financials[1];
  const financialDriverIds = ids(currentFinancial?.sourceIds, previousFinancial?.sourceIds);
  if (
    currentFinancial?.grossMargin != null
    && previousFinancial?.grossMargin != null
    && financialDriverIds.length
    && Math.abs(currentFinancial.grossMargin - previousFinancial.grossMargin) >= 0.002
  ) {
    const improved = currentFinancial.grossMargin > previousFinancial.grossMargin;
    companyDrivers.push({
      text: zh
        ? `最近季度毛利率较上一季${improved ? "改善" : "收窄"}，收入增长与盈利质量需要结合产品组合和投入节奏判断。`
        : `Latest-quarter gross margin ${improved ? "improved" : "contracted"} sequentially, so growth quality depends on mix and investment cadence.`,
      evidenceType: "inference",
      sourceIds: financialDriverIds,
      confidence: "medium",
    });
  }
  if (
    currentFinancial?.capitalExpenditure != null
    && currentFinancial.freeCashFlow != null
    && currentFinancial.freeCashFlow < 0
    && financialDriverIds.length
  ) {
    companyDrivers.push({
      text: zh
        ? "资本开支与负自由现金流表明扩张投入正在压低短期现金转化，后续需由收入和利润率兑现验证。"
        : "Capital spending and negative free cash flow show expansion is weighing on near-term cash conversion and requires later revenue and margin validation.",
      evidenceType: "inference",
      sourceIds: financialDriverIds,
      confidence: "medium",
    });
  }
  const [latestSegments, priorSegments] = input.segmentRevenue;
  if (latestSegments && priorSegments) {
    const priorByName = new Map(priorSegments.segments.map((segment) => [segment.name.toLowerCase(), segment.revenue]));
    const growthLeader = latestSegments.segments
      .map((segment) => ({ ...segment, prior: priorByName.get(segment.name.toLowerCase()) }))
      .filter((segment) => segment.revenue != null && segment.prior != null && segment.revenue > segment.prior)
      .sort((left, right) => (right.revenue! - right.prior!) - (left.revenue! - left.prior!))[0];
    const segmentIds = ids(latestSegments.sourceIds, priorSegments.sourceIds);
    if (growthLeader && segmentIds.length) {
      companyDrivers.push({
        text: zh
          ? `最近可用分部数据中，${growthLeader.name}是环比增长的重要来源，需继续验证其增速与利润贡献。`
          : `${growthLeader.name} was a leading source of sequential growth in the latest available segment data; its pace and profit contribution need validation.`,
        evidenceType: "inference",
        sourceIds: segmentIds,
        confidence: "medium",
      });
    }
  }
  const outputDrivers = companyDrivers.slice(0, 5);
  return {
    status: "available",
    mode: "company",
    role: route?.role ?? "company_only",
    archetype: zh ? "保守证据解读" : "conservative evidence read",
    conclusion: {
      text: zh ? `${input.company?.name ?? input.ticker} 已发布财报，${parts.join("，")}。` : `${input.company?.name ?? input.ticker} reported earnings; ${parts.join(" and ")}.`,
      evidenceType: "inference",
      sourceIds: resultIds,
      confidence: "low",
    },
    companyDrivers: outputDrivers,
    transmissionChain: [],
    counterEvidence,
    watchItems,
    confidence: {
      label: "low",
      reason: zh ? "模型输出未通过证据校验，当前展示由已验证字段生成的保守解读。" : "The model output failed evidence checks; this conservative read uses validated fields only.",
    },
    agent: {
      contractVersion: EARNINGS_INTERPRETATION_CONTRACT_VERSION,
      stages: [
        { key: "evidence", state: "completed", detail: zh ? "已冻结并索引当前财报快照。" : "Current earnings snapshot frozen and indexed." },
        { key: "route", state: "completed", detail: route?.rationale ?? "company_only" },
        { key: "research", state: "degraded", detail: zh ? "模型不可用或输出未通过校验。" : "Model unavailable or output rejected." },
        { key: "audit", state: "completed", detail: zh ? "已生成仅基于确定性字段的保守结果。" : "Conservative result generated from deterministic fields only." },
      ],
      acceptedClaims: 1 + outputDrivers.length + counterEvidence.length + watchItems.length,
      rejectedClaims: 0,
    },
  };
}

function enrichInterpretation(result: AiInterpretation, input: InterpretationInput, route: AgentRoute): AiInterpretation {
  const baseline = deterministicFallback(input, "AI_INTERPRETATION_INVALID", route);
  if (baseline.status !== "available") return result;
  const merge = (primary: EarningsInterpretationClaim[], support: EarningsInterpretationClaim[], limit: number) => {
    const seen = new Set(primary.map((claim) => claim.text.toLowerCase()));
    return [...primary, ...support.filter((claim) => !seen.has(claim.text.toLowerCase()))].slice(0, limit);
  };
  const companyDrivers = merge(result.companyDrivers, baseline.companyDrivers, 5);
  const counterEvidence = merge(result.counterEvidence, baseline.counterEvidence, 4);
  const watchItems = merge(result.watchItems, baseline.watchItems, 5);
  const transmissionChain = result.transmissionChain.length ? result.transmissionChain : deterministicTransmissionChain(input, route);
  const dataQualityCap = (input.conflicts?.length ?? 0) > 0 || (input.missing?.includes("results") ?? false);
  const auditDegraded = result.agent?.stages.some((stage) => stage.key === "audit" && stage.state === "degraded") ?? false;
  const acceptedClaims = 1 + companyDrivers.length + counterEvidence.length + watchItems.length + transmissionChain.length;
  return {
    ...result,
    mode: transmissionChain.length ? "ecosystem" : "company",
    role: route.role,
    companyDrivers,
    transmissionChain,
    counterEvidence,
    watchItems,
    confidence: dataQualityCap
      ? {
          label: "low",
          reason: input.language === "zh" ? "关键来源存在缺失或冲突，Agent 已将整体置信度限制为低。" : "Missing or conflicting key sources cap the overall agent confidence at low.",
        }
      : auditDegraded
        ? {
            label: result.confidence.label === "low" ? "low" : "medium",
            reason: input.language === "zh" ? "部分模型判断未通过审计，已使用确定性基线或删除相关内容。" : "Some model claims failed audit and were replaced with deterministic baselines or removed.",
          }
        : result.confidence,
    agent: result.agent && {
      ...result.agent,
      stages: result.agent.stages.map((stage) => stage.key === "route" ? { ...stage, detail: route.rationale } : stage),
      acceptedClaims,
    },
  };
}

function deterministicTransmissionChain(input: InterpretationInput, route: AgentRoute): EarningsInterpretationEdge[] {
  if (route.role === "company_only" || !route.ecosystemSourceIds.size) return [];
  const zh = input.language === "zh";
  const sourceIds = [...route.ecosystemSourceIds];
  const resultIds = [...new Set([
    ...(input.results?.sourceIds ?? []),
    ...input.financials.flatMap((row) => row.sourceIds),
  ].filter((id) => input.sources.some((source) => source.id === id)))];
  return route.allowedNodes.slice(0, -1).map((from, index) => {
    const to = route.allowedNodes[index + 1];
    const validationEdge = index === route.allowedNodes.length - 2;
    return {
      from,
      to,
      relation: transitionRelation(from, to, {
        knownSourceIds: new Set(),
        ecosystemSourceIds: route.ecosystemSourceIds,
        evidenceText: "",
        evidenceBySourceId: new Map(),
        ticker: input.ticker,
        language: input.language,
        allowedProperNouns: new Set(),
        allowedNodes: new Set(route.allowedNodes),
        hasRevenueEstimate: Boolean(input.estimates?.revenueEstimate),
        hasEpsEstimate: Boolean(input.estimates?.epsEstimate),
        role: route.role,
      }),
      lag: zh ? (validationEdge ? "未来 1–2 个季度" : "当前至未来 1 个季度") : (validationEdge ? "next 1–2 quarters" : "current to next quarter"),
      text: zh ? `${from}的变化可能传导至${to}，但仍需后续经营数据验证。` : `Changes in ${from} may transmit to ${to}, subject to later operating-data validation.`,
      evidenceType: "inference",
      sourceIds: validationEdge && resultIds.length ? resultIds : sourceIds,
      confidence: "low",
      counterEvidence: zh ? "若需求、供给、定价或兑现节奏与当前来源不同，这一传导关系将减弱。" : "The link weakens if demand, supply, pricing, or delivery timing diverges from current evidence.",
      nextEvidence: zh ? "后续公司业绩、分部数据、库存、毛利率与管理层说明。" : "Subsequent company results, segment data, inventory, margin, and management commentary.",
    };
  });
}

function parseJsonContent(content: string): RawInterpretation {
  const unfenced = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  const json = start >= 0 && end >= start ? unfenced.slice(start, end + 1) : unfenced;
  return JSON.parse(json) as RawInterpretation;
}

function hasCitableEventEvidence(input: InterpretationInput, knownSourceIds: Set<string>) {
  const candidateIds = [
    ...(input.event?.sourceIds ?? []),
    ...(input.results?.sourceIds ?? []),
    ...(input.estimates?.sourceIds ?? []),
    ...input.financials.flatMap((row) => row.sourceIds),
    ...(input.transcript?.sourceIds ?? []),
  ];
  return candidateIds.some((id) => knownSourceIds.has(id));
}

function promptInput(input: InterpretationInput, route: AgentRoute) {
  return {
    contractVersion: EARNINGS_INTERPRETATION_CONTRACT_VERSION,
    ticker: input.ticker,
    mode: input.mode,
    route: { role: route.role, rationale: route.rationale },
    company: input.company,
    event: input.event,
    estimates: input.estimates,
    results: input.results,
    financials: input.financials.slice(0, 2),
    segmentRevenue: input.segmentRevenue.slice(0, 2),
    news: input.news.slice(0, 5),
    filings: input.filings.slice(0, 5),
    transcript: compactTranscript(input.transcript),
    dataQuality: {
      missing: input.missing ?? [],
      conflicts: input.conflicts ?? [],
      capabilityStatus: input.capabilityStatus ?? {},
    },
    validatedSignals: validatedSignals(input),
    sources: input.sources.map(({ id, title, capability }) => ({ id, title, capability })),
    ecosystemEligibleSourceIds: [...route.ecosystemSourceIds],
    allowedTransmissionNodes: route.allowedNodes,
    allowedTransmissionEdges: route.allowedNodes.slice(0, -1).map((from, index) => ({ from, to: route.allowedNodes[index + 1] })),
  };
}

function compactTranscript(transcript: InterpretationInput["transcript"]) {
  if (!transcript) return null;
  const clip = (value: string | undefined, limit = 900) => value?.slice(0, limit);
  return {
    available: transcript.available,
    managementTone: transcript.managementTone,
    guidanceTone: transcript.guidanceTone,
    riskLanguage: transcript.riskLanguage,
    repeatedQuestions: transcript.repeatedQuestions?.slice(0, 6).map((value) => value.slice(0, 240)),
    managementAnswers: transcript.managementAnswers?.slice(0, 8).map((item) => ({
      topic: clip(item.topic, 160),
      answer: clip(item.answer),
      sourceIds: item.sourceIds,
    })),
    keyQuotes: transcript.keyQuotes?.slice(0, 6).map((item) => ({
      text: clip(item.text, 500),
      speaker: clip(item.speaker, 120),
      sourceIds: item.sourceIds,
    })),
    sourceIds: transcript.sourceIds,
  };
}

function validatedSignals(input: InterpretationInput) {
  const verdicts = computeBeatMiss(input.results, input.estimates);
  const current = input.financials[0];
  const previous = input.financials[1];
  const currency = input.company?.currency ?? "USD";
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "JPY" ? "¥" : currency === "USD" ? "$" : `${currency} `;
  const money = (value: number | undefined) => value == null ? undefined : `${symbol}${(value / 1_000_000_000).toFixed(2)}B`;
  const eps = (value: number | undefined) => value == null ? undefined : `${symbol}${value.toFixed(2)}`;
  const pct = (value: number | undefined) => value == null ? undefined : `${(value * 100).toFixed(1)}%`;
  const change = (value: number | undefined, prior: number | undefined) => value == null || prior == null || prior === 0 ? undefined : `${(((value - prior) / Math.abs(prior)) * 100).toFixed(1)}%`;
  return {
    revenueActual: money(input.results?.revenueActual),
    revenueEstimate: money(input.estimates?.revenueEstimate),
    revenueVsEstimate: verdicts.revenue,
    epsActual: eps(input.results?.epsActual),
    epsEstimate: eps(input.estimates?.epsEstimate),
    epsVsEstimate: verdicts.eps,
    grossMargin: pct(input.results?.grossMargin),
    operatingMargin: pct(input.results?.operatingMargin),
    netIncome: money(input.results?.netIncome),
    revenueChangeVsPriorQuarter: change(current?.revenue, previous?.revenue),
    netIncomeChangeVsPriorQuarter: change(current?.netIncome, previous?.netIncome),
    guidance: input.results?.guidanceText,
  };
}

function normalize(
  value: RawInterpretation,
  context: ValidationContext,
  language: "en" | "zh",
  input: InterpretationInput,
  route: AgentRoute,
): AiInterpretation {
  const baseline = deterministicFallback(input, "AI_INTERPRETATION_INVALID", route);
  const modelConclusion = cleanClaim(value.conclusion, context, true);
  const conclusion = modelConclusion ?? (baseline.status === "available" ? baseline.conclusion : undefined);
  if (!conclusion) return unavailable("AI_INTERPRETATION_INVALID");
  const companyDrivers = cleanClaims(value.companyDrivers, context, 5, true);
  const counterEvidence = cleanClaims(value.counterEvidence, context, 5, true);
  const watchItems = cleanClaims(value.watchItems, context, 5, true);
  const transmissionChain = cleanEdges(value.transmissionChain, context).filter((edge) =>
    Array.isArray(edge.sourceIds) && edge.sourceIds.some((id) => context.ecosystemSourceIds.has(id))
  );
  const ecosystem = value.mode === "ecosystem" && transmissionChain.length > 0;
  const rawClaims = 1
    + arrayLength(value.companyDrivers)
    + arrayLength(value.counterEvidence)
    + arrayLength(value.watchItems)
    + arrayLength(value.transmissionChain);
  const acceptedClaims = 1 + companyDrivers.length + counterEvidence.length + watchItems.length + transmissionChain.length;

  return {
    status: "available",
    mode: ecosystem ? "ecosystem" : "company",
    role: context.role,
    archetype: cleanText(value.archetype, 80),
    conclusion,
    companyDrivers,
    transmissionChain: ecosystem ? transmissionChain : [],
    counterEvidence,
    watchItems,
    confidence: {
      label: confidence(value.confidence),
      reason: language === "zh" ? "该解读由模型基于所列来源生成，仍需核对引用证据。" : "Model-generated interpretation; verify cited evidence.",
    },
    agent: {
      contractVersion: EARNINGS_INTERPRETATION_CONTRACT_VERSION,
      stages: [
        { key: "evidence", state: "completed", detail: language === "zh" ? "已冻结并索引当前财报快照。" : "Current earnings snapshot frozen and indexed." },
        { key: "route", state: "completed", detail: context.role },
        { key: "research", state: "completed", detail: language === "zh" ? "模型已完成受约束的结构化研究。" : "Model completed constrained structured research." },
        { key: "audit", state: rawClaims === acceptedClaims && modelConclusion ? "completed" : "degraded", detail: language === "zh" ? `通过 ${acceptedClaims} 条，剔除 ${Math.max(rawClaims - acceptedClaims, 0)} 条${modelConclusion ? "" : "，结论已使用确定性基线替代"}。` : `${acceptedClaims} claims accepted; ${Math.max(rawClaims - acceptedClaims, 0)} rejected${modelConclusion ? "" : "; deterministic conclusion substituted"}.` },
      ],
      acceptedClaims,
      rejectedClaims: Math.max(rawClaims - acceptedClaims, 0) + (modelConclusion ? 0 : 1),
    },
  };
}

function cleanClaims(value: unknown, context: ValidationContext, limit: number, requireSource: boolean) {
  return (Array.isArray(value) ? value : []).flatMap((item) => cleanClaim(item, context, requireSource) ?? []).slice(0, limit);
}

function cleanClaim(value: unknown, context: ValidationContext, requireSource = false): EarningsInterpretationClaim | null {
  const item = record(value);
  const text = cleanText(item.text, 500);
  if (!context.hasRevenueEstimate && expectationClaim(text, "revenue")) return null;
  if (!context.hasEpsEstimate && expectationClaim(text, "eps")) return null;
  if (!validNarrative(text, context)) return null;
  const requestedType = item.evidenceType === "fact" || item.evidenceType === "inference" || item.evidenceType === "to_verify"
    ? item.evidenceType
    : "unverified";
  const validSourceIds = sourceIds(item.sourceIds, context.knownSourceIds);
  if (Array.isArray(validSourceIds) && !sourceAnchorsSupported(text, validSourceIds, context.evidenceBySourceId)) return null;
  const factSupported = requestedType === "fact"
    && Array.isArray(validSourceIds)
    && validSourceIds.some((id) => context.evidenceBySourceId.get(id)?.toLowerCase().includes(text.toLowerCase()));
  const evidenceType = factSupported
    ? "fact"
    : requestedType === "to_verify" ? "to_verify" : requestedType === "unverified" ? "unverified" : "inference";
  if ((requireSource || evidenceType === "fact") && validSourceIds === "unavailable") return null;
  const requestedConfidence = confidence(item.confidence);
  const validatedConfidence = evidenceType === "fact"
    ? requestedConfidence
    : evidenceType === "inference" && requestedConfidence === "high" ? "medium" : evidenceType === "unverified" || evidenceType === "to_verify" ? "low" : requestedConfidence;
  return {
    text,
    evidenceType,
    sourceIds: validSourceIds,
    confidence: validatedConfidence,
    rationale: cleanText(item.rationale, 300) || undefined,
    counterEvidence: cleanText(item.counterEvidence, 300) || undefined,
    nextEvidence: cleanText(item.nextEvidence, 300) || undefined,
    lag: cleanText(item.lag, 80) || undefined,
  };
}

function sourceAnchorsSupported(text: string, sourceIds: string[], evidenceBySourceId: Map<string, string>) {
  const evidence = sourceIds.map((id) => evidenceBySourceId.get(id) ?? "").join("\n");
  if (hasUnsupportedNumber(text, evidence)) return false;
  const domainTokens = text.match(/\b(?:AI|HBM\d*E?|DRAM|NAND|EUV|RPO|SCA|CapEx)\b/gi) ?? [];
  return domainTokens.every((token) => appearsInEvidence(token, evidence));
}

function expectationClaim(text: string, metric: "revenue" | "eps") {
  const names = metric === "revenue" ? /\b(?:revenue|sales)\b|营收/i : /\bEPS\b|每股收益/i;
  const expectation = /\b(?:beat|miss|above|below)\b[^.]{0,40}\b(?:estimate|expectation|consensus)\b|超预期|不及预期|高于[^，。]{0,20}预期|低于[^，。]{0,20}预期/i;
  return names.test(text) && expectation.test(text) && !/此前[^，。]{0,12}指引|prior company guidance/i.test(text);
}

function cleanEdges(value: unknown, context: ValidationContext) {
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    const edge = record(item);
    const from = cleanText(edge.from, 100);
    const to = cleanText(edge.to, 100);
    const relation = transitionRelation(from, to, context);
    const lag = cleanText(edge.lag, 80);
    if (!context.allowedNodes.has(from) || !context.allowedNodes.has(to) || !relation || !validLag(lag)) return [];
    const text = context.language === "zh"
      ? `${from}的变化可能影响${to}，仍需后续数据验证。`
      : `Changes in ${from} may affect ${to} and require later validation.`;
    const claim = cleanClaim({ ...edge, text, evidenceType: "inference" }, context, true);
    return claim ? [{ ...claim, from, to, relation, lag } satisfies EarningsInterpretationEdge] : [];
  }).slice(0, 5);
}

function validLag(value: string) {
  return Boolean(value) && value.length <= 80 && !prohibitedPattern.test(value);
}

function routeAgent(input: InterpretationInput, knownSourceIds: Set<string>): AgentRoute {
  const demandIds = demandInitiatorSourceIds(input, knownSourceIds);
  if (demandIds.size) {
    return {
      role: "demand_initiator",
      ecosystemSourceIds: demandIds,
      allowedNodes: transmissionNodes(input, "demand_initiator"),
      rationale: input.language === "zh" ? "当前来源同时披露平台/AI 基础设施语境与资本开支或部署。" : "Current sources contain both platform or AI-infrastructure context and investment or deployment evidence.",
    };
  }

  const supplierIds = upstreamSupplierSourceIds(input, knownSourceIds);
  if (supplierIds.size) {
    return {
      role: "upstream_supplier",
      ecosystemSourceIds: supplierIds,
      allowedNodes: transmissionNodes(input, "upstream_supplier"),
      rationale: input.language === "zh" ? "当前来源明确连接存储/半导体产品与下游需求、定价或出货。" : "Current sources explicitly connect memory or semiconductor products with downstream demand, pricing, or shipments.",
    };
  }

  return {
    role: "company_only",
    ecosystemSourceIds: new Set(),
    allowedNodes: transmissionNodes(input, "company_only"),
    rationale: input.language === "zh" ? "当前快照缺少可审计的跨环节关系证据。" : "The current snapshot lacks auditable cross-node relationship evidence.",
  };
}

function demandInitiatorSourceIds(input: InterpretationInput, knownSourceIds: Set<string>) {
  const platformIds = new Set<string>();
  const investmentIds = new Set<string>();
  const evidence: Array<{ text: string; sourceIds?: string[] }> = [];
  const collect = (text: unknown, sourceIds: string[] | undefined) => {
    if (typeof text === "string") evidence.push({ text, sourceIds });
  };
  collect(`${input.company?.sector ?? ""} ${input.company?.industry ?? ""}`, input.company?.sourceIds);
  collect(input.results?.guidanceText, input.results?.fieldSourceIds?.guidanceText ?? input.results?.sourceIds);
  input.results?.segmentHighlights?.forEach((text) => collect(text, input.results?.fieldSourceIds?.segmentHighlights ?? input.results?.sourceIds));
  input.segmentRevenue.forEach((row) => row.segments.forEach((segment) => collect(segment.name, row.sourceIds)));
  input.news.forEach((item) => collect(`${item.title} ${item.summary ?? ""}`, item.sourceIds));
  input.filings.forEach((item) => collect(`${item.title ?? ""} ${item.summary ?? ""}`, item.sourceIds));
  input.transcript?.managementAnswers?.forEach((item) => collect(`${item.topic} ${item.answer}`, item.sourceIds));
  input.transcript?.keyQuotes?.forEach((item) => collect(item.text, item.sourceIds));

  evidence.forEach(({ text, sourceIds }) => {
    const validIds = sourceIds?.filter((id) => knownSourceIds.has(id)) ?? [];
    if (platformPattern.test(text)) validIds.forEach((id) => platformIds.add(id));
    if (investmentPattern.test(text)) validIds.forEach((id) => investmentIds.add(id));
  });
  input.financials
    .filter((row) => row.capitalExpenditure != null)
    .flatMap((row) => row.sourceIds)
    .filter((id) => knownSourceIds.has(id))
    .forEach((id) => investmentIds.add(id));
  return platformIds.size && investmentIds.size
    ? new Set([...platformIds, ...investmentIds])
    : new Set<string>();
}

function upstreamSupplierSourceIds(input: InterpretationInput, knownSourceIds: Set<string>) {
  const productIds = new Set<string>();
  const demandIds = new Set<string>();
  const collect = (text: unknown, sourceIds: string[] | undefined) => {
    if (typeof text !== "string") return;
    const validIds = sourceIds?.filter((id) => knownSourceIds.has(id)) ?? [];
    if (memoryProductPattern.test(text)) validIds.forEach((id) => productIds.add(id));
    if (memoryDemandPattern.test(text)) validIds.forEach((id) => demandIds.add(id));
  };
  collect(input.results?.guidanceText, input.results?.fieldSourceIds?.guidanceText ?? input.results?.sourceIds);
  input.results?.segmentHighlights?.forEach((text) => collect(text, input.results?.fieldSourceIds?.segmentHighlights ?? input.results?.sourceIds));
  input.segmentRevenue.forEach((row) => row.segments.forEach((segment) => collect(segment.name, row.sourceIds)));
  input.news.forEach((item) => collect(`${item.title} ${item.summary ?? ""}`, item.sourceIds));
  input.filings.forEach((item) => collect(`${item.title ?? ""} ${item.summary ?? ""}`, item.sourceIds));
  input.transcript?.managementAnswers?.forEach((item) => collect(`${item.topic} ${item.answer}`, item.sourceIds));
  input.transcript?.keyQuotes?.forEach((item) => collect(item.text, item.sourceIds));
  return productIds.size && demandIds.size ? new Set([...productIds, ...demandIds]) : new Set<string>();
}

function transmissionNodes(input: InterpretationInput, role: AgentRoute["role"]) {
  if (role === "upstream_supplier") {
    return input.language === "zh"
      ? ["AI 与数据中心需求", "存储需求与产品组合", input.company?.name || input.ticker, "收入与利润率验证"]
      : ["AI and data-center demand", "Memory demand and product mix", input.company?.name || input.ticker, "Revenue and margin validation"];
  }
  return input.language === "zh"
    ? [input.company?.name || input.ticker, "资本开支与部署", "基础设施容量", "半导体与数据中心基础设施需求", "收入与利润率验证"]
    : [input.company?.name || input.ticker, "Capital expenditure and deployment", "Infrastructure capacity", "Semiconductor and data-center infrastructure demand", "Revenue and margin validation"];
}

function transitionRelation(from: string, to: string, context: ValidationContext) {
  if (context.role === "upstream_supplier") {
    const [demand, product, company, validation] = [...context.allowedNodes];
    const relations = context.language === "zh"
      ? new Map([
          [`${demand}\u0000${product}`, "下游工作负载可能改变存储需求与产品组合"],
          [`${product}\u0000${company}`, "需求、供给与定价共同影响公司兑现"],
          [`${company}\u0000${validation}`, "需由后续收入、毛利率和库存验证"],
        ])
      : new Map([
          [`${demand}\u0000${product}`, "downstream workloads may change memory demand and product mix"],
          [`${product}\u0000${company}`, "demand, supply, and pricing jointly affect company delivery"],
          [`${company}\u0000${validation}`, "requires later revenue, margin, and inventory validation"],
        ]);
    return relations.get(`${from}\u0000${to}`) ?? "";
  }
  const [company, investment, capacity, demand, validation] = [...context.allowedNodes];
  const key = `${from}\u0000${to}`;
  const relations = context.language === "zh"
    ? new Map([
        [`${company}\u0000${investment}`, "公司披露的投入与部署变化"],
        [`${investment}\u0000${capacity}`, "可能改变建设与交付需求"],
        [`${capacity}\u0000${demand}`, "可能影响芯片、服务器、网络与数据中心基础设施需求"],
        [`${demand}\u0000${validation}`, "需由后续收入与利润率数据验证"],
      ])
    : new Map([
        [`${company}\u0000${investment}`, "reported investment and deployment changes"],
        [`${investment}\u0000${capacity}`, "may change construction and delivery demand"],
        [`${capacity}\u0000${demand}`, "may affect semiconductor, server, networking, and data-center infrastructure demand"],
        [`${demand}\u0000${validation}`, "requires later revenue and margin validation"],
      ]);
  return relations.get(key) ?? "";
}

function validNarrative(text: string, context: ValidationContext) {
  if (!text || prohibitedPattern.test(text) || hasUnsupportedNumber(text, context.evidenceText)) return false;
  const allowedTickers = new Set([context.ticker.toUpperCase(), "AI", "EPS", "EBIT", "EBITDA", "FCF", "OCF", "GAAP", "FX", "QOQ", "YOY"]);
  if ([...text.matchAll(/\b[A-Z]{2,5}\b/g)].some(([token]) => !allowedTickers.has(token) && !appearsInEvidence(token, context.evidenceText))) return false;
  return ![...text.matchAll(/\b[A-Z][a-z]{2,}\b/g)].some((match) => {
    const token = match[0];
    if (context.allowedProperNouns.has(token) || appearsInEvidence(token, context.evidenceText)) return false;
    if (match.index === 0) {
      const continuation = text.slice(token.length);
      return /^\s+(?:will|may|could|benefits?|gains?|loses?|Inc\b|Corp\b|Ltd\b|Holdings\b)/i.test(continuation);
    }
    return true;
  });
}

function appearsInEvidence(value: string, evidenceText: string) {
  return new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(evidenceText);
}

function hasUnsupportedNumber(text: string, evidenceText: string) {
  const evidenceNumbers = new Set((evidenceText.match(/\d+(?:\.\d+)?%?/g) ?? []).map(normalizeNumberToken));
  return (text.match(/\d+(?:\.\d+)?%?/g) ?? []).some((token) => !evidenceNumbers.has(normalizeNumberToken(token)));
}

function normalizeNumberToken(value: string) {
  return value.replace(/^0+(?=\d)/, "");
}

function allowedProperNouns(input: InterpretationInput) {
  return new Set([
    ...(input.company?.name.match(/\b[A-Z][a-z]{2,}\b/g) ?? []),
    "Capital", "Revenue", "Infrastructure", "Industry", "Changes", "Management", "Reported", "Current",
    "Higher", "Lower", "Growth", "Demand", "Margin", "Earnings", "Cash", "Guidance", "Content", "Operating",
    "Quarterly", "Company", "Customer", "Free", "One", "Direct", "This", "The",
  ]);
}

function evidenceBySourceId(input: InterpretationInput) {
  const evidence = new Map<string, string[]>();
  const add = (value: unknown, ids: string[] | undefined) => {
    if (!ids?.length) return;
    const text = JSON.stringify(value);
    ids.forEach((id) => evidence.set(id, [...(evidence.get(id) ?? []), text]));
  };
  add(input.company, input.company?.sourceIds);
  add(input.event, input.event?.sourceIds);
  add(input.estimates, input.estimates?.sourceIds);
  add(input.results, input.results?.sourceIds);
  input.financials.forEach((row) => add(row, row.sourceIds));
  input.segmentRevenue.forEach((row) => add(row, row.sourceIds));
  input.news.forEach((item) => add(item, item.sourceIds));
  input.filings.forEach((item) => add(item, item.sourceIds));
  if (input.transcript) {
    add(input.transcript, input.transcript.sourceIds);
    input.transcript.managementAnswers?.forEach((item) => add(item, item.sourceIds));
    input.transcript.keyQuotes?.forEach((item) => add(item, item.sourceIds));
  }
  return new Map([...evidence].map(([id, chunks]) => [id, chunks.join("\n")]));
}

function sourceIds(value: unknown, knownSourceIds: Set<string>): ClaimSourceIds {
  const ids = Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === "string" && knownSourceIds.has(id)))]
    : [];
  return ids.length ? ids : "unavailable";
}

function confidence(value: unknown): AiInterpretation["confidence"]["label"] {
  if (typeof value === "number") return value >= 0.8 ? "high" : value < 0.5 ? "low" : "medium";
  return value === "high" || value === "low" ? value : "medium";
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export function unavailableInterpretation(reason: string): AiInterpretation {
  return unavailable(reason);
}

function unavailable(reason: string): AiInterpretation {
  return {
    status: "unavailable",
    mode: "company",
    companyDrivers: [],
    transmissionChain: [],
    counterEvidence: [],
    watchItems: [],
    confidence: { label: "low", reason },
    reason,
  };
}
