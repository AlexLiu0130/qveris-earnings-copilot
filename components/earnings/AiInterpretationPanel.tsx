"use client";

import { useEffect, useState } from "react";
import type { ClaimSourceIds, ConfidenceLabel, EarningsInterpretation, SourceRef } from "@/lib/earnings/types";
import { Cite } from "./Cite";

type Tab = "company" | "ecosystem" | "watch";

const copy = {
  en: {
    title: "AI deep interpretation",
    company: "Company read",
    ecosystem: "Industry transmission",
    watch: "What to verify",
    conclusion: "Evidence-backed conclusion",
    drivers: "Company drivers",
    counter: "Counter-evidence",
    watchItems: "What would confirm or challenge this read",
    confidence: "Interpretation confidence",
    evidence: "Evidence",
    rationale: "Why it matters",
    challenge: "What could challenge it",
    nextEvidence: "Next evidence",
    lag: "Lag",
    relation: "Relation",
    noClaims: "No source-backed claims were returned.",
    unavailable: "No evidence-backed AI interpretation is available for this report.",
    noInference: "No additional inference is shown.",
    disabled: "AI interpretation was not requested for this report.",
    invalid: "The model response did not pass the evidence checks.",
    failed: "The AI service is temporarily unavailable.",
    insufficient: "No resolved earnings event is available for interpretation.",
    loading: "Building an evidence-backed interpretation…",
  },
  zh: {
    title: "AI 深度解读",
    company: "公司解读",
    ecosystem: "产业传导",
    watch: "后续验证",
    conclusion: "有证据支持的结论",
    drivers: "公司驱动因素",
    counter: "反向证据",
    watchItems: "哪些信息会验证或挑战这一解读",
    confidence: "解读置信度",
    evidence: "证据类型",
    rationale: "为何重要",
    challenge: "反证条件",
    nextEvidence: "下一证据",
    lag: "传导时滞",
    relation: "传导关系",
    noClaims: "未返回有来源支持的判断。",
    unavailable: "本次财报暂无有证据支持的 AI 深度解读。",
    noInference: "不展示额外推断。",
    disabled: "本次报告未请求 AI 深度解读。",
    invalid: "模型结果未通过来源与证据校验。",
    failed: "AI 服务暂时不可用。",
    insufficient: "当前没有已确认的财报事件，暂不生成解读。",
    loading: "正在基于当前来源生成解读…",
  },
};

const confidenceClass: Record<ConfidenceLabel, string> = {
  high: "text-beat",
  medium: "text-warning",
  low: "text-miss",
};

export function AiInterpretationPanel({
  interpretation: initialInterpretation,
  sources: initialSources,
  language,
  ticker,
  analysisId,
  autoLoad = false,
}: {
  interpretation?: EarningsInterpretation;
  sources: SourceRef[];
  language: "en" | "zh";
  ticker?: string;
  analysisId?: string;
  autoLoad?: boolean;
}) {
  const t = copy[language];
  const [interpretation, setInterpretation] = useState(initialInterpretation);
  const [sources, setSources] = useState(initialSources);
  const [loading, setLoading] = useState(false);
  const hasEcosystem = interpretation?.status === "available" && interpretation.mode === "ecosystem";
  const [tab, setTab] = useState<Tab>(interpretation?.mode === "ecosystem" ? "ecosystem" : "company");
  const activeTab = tab === "ecosystem" && !hasEcosystem ? "company" : tab;

  useEffect(() => {
    const shouldLoad = autoLoad
      && ticker
      && analysisId
      && (!interpretation || interpretation.reason === "AI_INTERPRETATION_DISABLED");
    if (!shouldLoad) return;
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/earnings/interpretation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("AI_INTERPRETATION_UNAVAILABLE");
        const payload = await response.json() as { interpretation?: EarningsInterpretation; sources?: SourceRef[] };
        setInterpretation(payload.interpretation ?? unavailableClientInterpretation());
        if (payload.sources?.length) setSources(payload.sources);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setInterpretation(unavailableClientInterpretation());
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [analysisId, autoLoad, interpretation, ticker]);

  if (loading || !interpretation || interpretation.status === "unavailable") {
    return (
      <section className="panel p-5" aria-label={t.title}>
        <h2 className="font-display text-2xl italic text-ink">{t.title}</h2>
        <div className="mt-4 border-l-2 border-line-strong pl-4">
          <p className="label text-ink-soft">{loading ? t.loading : t.unavailable}</p>
          {!loading && <p className="mt-1 text-sm leading-relaxed text-ink-faint">{unavailableReason(interpretation?.reason, t)}</p>}
        </div>
      </section>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "company", label: t.company },
    ...(hasEcosystem ? [{ id: "ecosystem" as const, label: t.ecosystem }] : []),
    { id: "watch", label: t.watch },
  ];

  return (
    <section className="panel min-w-0 p-5" aria-label={t.title}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl italic text-ink">{t.title}</h2>
          {interpretation.archetype && <p className="label mt-1 text-accent">{interpretation.archetype}</p>}
        </div>
        <div className="flex flex-wrap gap-1 border border-line bg-surface-2 p-1" role="tablist" aria-label={t.title}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeTab === item.id}
              aria-controls={`ai-interpretation-${item.id}`}
              onClick={() => setTab(item.id)}
              className={`min-h-8 px-3 text-xs transition-colors ${activeTab === item.id ? "bg-surface text-ink shadow-sm" : "text-ink-faint hover:text-ink"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div id={`ai-interpretation-${activeTab}`} role="tabpanel" className="mt-5 min-w-0">
        {activeTab === "company" && (
          <div className="space-y-5">
            {interpretation.conclusion && (
              <div className="border-l-2 border-accent bg-accent-soft px-4 py-3">
                <p className="label text-accent">{t.conclusion}</p>
                <Claim claim={interpretation.conclusion} sources={sources} language={language} emphasis />
              </div>
            )}
            <ClaimList title={t.drivers} claims={interpretation.companyDrivers ?? []} sources={sources} empty={t.noClaims} language={language} marker="01" />
            <ClaimList title={t.counter} claims={interpretation.counterEvidence ?? []} sources={sources} empty={t.noClaims} language={language} marker="×" tone="text-miss" />
          </div>
        )}

        {activeTab === "ecosystem" && (
          <TransmissionChain edges={interpretation.transmissionChain ?? []} sources={sources} language={language} empty={t.noClaims} />
        )}

        {activeTab === "watch" && (
          <div className="space-y-5">
            <ClaimList title={t.watchItems} claims={interpretation.watchItems ?? []} sources={sources} empty={t.noClaims} language={language} marker="→" />
            <div className="hairline pt-4">
              <p className="label text-ink-soft">{t.confidence}</p>
              <p className={`mt-2 text-sm leading-relaxed ${confidenceClass[interpretation.confidence.label]}`}>
                {interpretation.confidence.reason}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Claim({ claim, sources, language, emphasis = false }: { claim: EarningsInterpretation["conclusion"]; sources: SourceRef[]; language: "en" | "zh"; emphasis?: boolean }) {
  if (!claim) return null;
  const t = copy[language];
  return (
    <div className="mt-2">
      <p className={`text-sm leading-relaxed ${emphasis ? "text-ink" : "text-ink-soft"}`}>
        {claim.text}<Cite ids={idsForCite(claim.sourceIds)} sources={sources} /><EvidenceTag label={t.evidence} value={claim.evidenceType} />
      </p>
      <ClaimMeta claim={claim} language={language} />
    </div>
  );
}

function ClaimList({
  title,
  claims,
  sources,
  empty,
  language,
  marker,
  tone = "text-accent-dim",
}: {
  title: string;
  claims: EarningsInterpretation["companyDrivers"];
  sources: SourceRef[];
  empty: string;
  language: "en" | "zh";
  marker: string;
  tone?: string;
}) {
  return (
    <div>
      <h3 className="label mb-2 text-accent">{title}</h3>
      {claims.length ? (
        <ul className="space-y-2">
          {claims.map((claim, index) => (
            <li key={`${claim.text}-${index}`} className="flex min-w-0 gap-3 text-sm leading-relaxed text-ink-soft">
              <span className={`num shrink-0 ${tone}`}>{marker === "01" ? String(index + 1).padStart(2, "0") : marker}</span>
              <span className="min-w-0">
                {claim.text}<Cite ids={idsForCite(claim.sourceIds)} sources={sources} /><EvidenceTag label={copy[language].evidence} value={claim.evidenceType} />
                <ClaimMeta claim={claim} language={language} />
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-faint">{empty}</p>}
    </div>
  );
}

function ClaimMeta({ claim, language }: { claim: EarningsInterpretation["companyDrivers"][number]; language: "en" | "zh" }) {
  const t = copy[language];
  const rows = [
    claim.rationale && [t.rationale, claim.rationale],
    claim.counterEvidence && [t.challenge, claim.counterEvidence],
    claim.nextEvidence && [t.nextEvidence, claim.nextEvidence],
    claim.lag && [t.lag, claim.lag],
  ].filter(Boolean) as string[][];
  if (!rows.length) return null;
  return (
    <dl className="mt-2 grid gap-x-4 gap-y-1 border-l border-line-strong pl-3 text-xs text-ink-faint sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={`${label}-${value}`} className="min-w-0">
          <dt className="label inline text-[0.55rem] text-ink-faint">{label} · </dt>
          <dd className="inline break-words leading-relaxed">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TransmissionChain({
  edges,
  sources,
  language,
  empty,
}: {
  edges: EarningsInterpretation["transmissionChain"];
  sources: SourceRef[];
  language: "en" | "zh";
  empty: string;
}) {
  const t = copy[language];
  if (!edges.length) return <p className="text-sm text-ink-faint">{empty}</p>;

  return (
    <ol className="divide-y divide-line border-y border-line">
      {edges.map((edge, index) => (
        <li key={`${edge.from}-${edge.to}-${index}`} className="min-w-0 py-4 first:pt-0 last:pb-0 sm:py-5">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Node label={edge.from} />
            <div className="flex shrink-0 items-center gap-2 text-xs text-ink-faint sm:flex-1">
              <span className="h-5 border-l border-line-strong sm:h-px sm:min-w-6 sm:flex-1 sm:border-l-0 sm:border-t" />
              <span aria-hidden="true" className="text-accent">→</span>
              <span className="h-5 border-l border-line-strong sm:hidden" />
            </div>
            <Node label={edge.to} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 pl-3 text-xs text-ink-faint sm:pl-0">
            <span>{t.relation}: {edge.relation}</span>
            <span>{t.lag}: {edge.lag}</span>
            <span>{t.evidence}: {edge.evidenceType}<Cite ids={idsForCite(edge.sourceIds)} sources={sources} /></span>
            <span className={confidenceClass[edge.confidence]}>{edge.confidence}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Node({ label }: { label: string }) {
  return <p className="min-w-0 border-l-2 border-blue pl-3 text-sm font-medium leading-relaxed text-ink sm:w-5/12">{label}</p>;
}

function idsForCite(ids: ClaimSourceIds) {
  return Array.isArray(ids) ? ids : undefined;
}

function EvidenceTag({ label, value }: { label: string; value: string }) {
  return <span className="label ml-2 whitespace-nowrap text-[0.55rem] text-ink-faint">{label} · {value}</span>;
}

function unavailableReason(reason: string | undefined, t: typeof copy.en) {
  if (reason === "AI_INTERPRETATION_DISABLED") return t.disabled;
  if (reason === "AI_INTERPRETATION_INVALID") return t.invalid;
  if (reason === "AI_INTERPRETATION_UNAVAILABLE") return t.failed;
  if (reason === "AI_INTERPRETATION_EVIDENCE_INSUFFICIENT") return t.insufficient;
  return reason || t.noInference;
}

function unavailableClientInterpretation(): EarningsInterpretation {
  return {
    status: "unavailable",
    mode: "company",
    companyDrivers: [],
    transmissionChain: [],
    counterEvidence: [],
    watchItems: [],
    confidence: { label: "low", reason: "AI_INTERPRETATION_UNAVAILABLE" },
    reason: "AI_INTERPRETATION_UNAVAILABLE",
  };
}
