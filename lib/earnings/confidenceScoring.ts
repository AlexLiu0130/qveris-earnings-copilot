import type { CapabilityState, ConfidenceLabel, EarningsAnalysis, SourceRef } from "@/lib/earnings/types";
import type { Lang } from "@/lib/i18n/dict";

export function scoreConfidence(input: {
  mode: EarningsAnalysis["mode"];
  estimates?: EarningsAnalysis["estimates"];
  results?: EarningsAnalysis["results"];
  sources: SourceRef[];
  capabilityStatus: Record<string, CapabilityState>;
  conflicts: string[];
}, lang: Lang = "en") {
  const zh = lang === "zh";
  if (input.conflicts.length > 0) {
    return {
      label: "low" as ConfidenceLabel,
      reason: zh ? "检测到多个来源冲突，请使用公司公告或监管文件复核数值。" : "Multiple source conflicts were detected; verify values against company releases or filings.",
    };
  }

  const hasEnoughSources = input.sources.length >= 3;
  const hasEstimates = input.estimates?.revenueEstimate != null || input.estimates?.epsEstimate != null;
  const hasResults = input.results?.revenueActual != null || input.results?.epsActual != null;
  const transcriptAvailable = input.capabilityStatus.transcript === "available";
  const filingsAvailable = input.capabilityStatus.filings === "available";

  if ((input.mode === "flash" || input.mode === "combined") && (!hasResults || !hasEstimates)) {
    return {
      label: "low" as ConfidenceLabel,
      reason: zh ? "已发布财报缺少实际值或一致预期，因此无法可靠判断是否超预期。" : "Reported-result analysis is missing actuals or estimates, so beat/miss interpretation is limited.",
    };
  }

  if (hasEnoughSources && filingsAvailable && (input.mode === "preview" || hasResults) && transcriptAvailable) {
    return {
      label: "high" as ConfidenceLabel,
      reason: zh ? "核心财务数据、公告文件和电话会背景均可用，且多来源之间未发现冲突。" : "Core financial data, filings, transcript context, and multiple sources are available with no detected conflicts.",
    };
  }

  if (hasEnoughSources && (hasEstimates || hasResults)) {
    return {
      label: "medium" as ConfidenceLabel,
      reason: zh ? "核心财报数据和多个来源可用，但电话会、业绩指引或分析师背景仍可能不完整。" : "Core earnings data and multiple sources are available, but transcript, guidance, or analyst context may be incomplete.",
    };
  }

  return {
    label: "low" as ConfidenceLabel,
    reason: zh ? "当前连接的数据源仅返回了部分信息。" : "Only partial data is available from connected sources.",
  };
}
