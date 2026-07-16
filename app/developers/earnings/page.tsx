import Link from "next/link";
import { getDict } from "@/lib/i18n/server";
import { CodeBlock } from "@/components/developer/CodeBlock";

export const metadata = {
  title: "Developers · QVeris Earnings Copilot",
};

const CURL_EXAMPLE = `curl -X POST /api/earnings/analyze \\
  -H "Content-Type: application/json" \\
  -d '{
    "ticker": "NVDA",
    "mode": "auto",
    "includeSources": true,
    "includeTranscript": true
  }'`;

const JSON_EXAMPLE = `{
  "ticker": "NVDA",
  "mode": "combined",
  "analysis": {
    "summaryBullets": ["…"],
    "confidence": {
      "label": "medium",
      "reason": "Results, estimates, filings and news are available; transcript is unavailable."
    }
  },
  "capabilityStatus": {
    "results": "available",
    "transcript": "unavailable"
  },
  "missing": ["transcript"],
  "conflicts": [],
  "sources": [
    {
      "id": "NVDA-qveris-get_earnings_results",
      "title": "QVeris earnings results",
      "provider": "QVeris",
      "capability": "get_earnings_results",
      "retrievedAt": "2026-07-08T00:00:00Z"
    }
  ]
}`;

const TS_EXAMPLE = `const res = await fetch("/api/earnings/analyze", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ticker: "NVDA", mode: "auto" }),
});
const report: AnalyzeEarningsResponse = await res.json();

// every numeric claim carries sourceIds — render or refuse
report.sources.length;        // audit trail
report.missing;               // what the agent could NOT get
report.analysis.confidence;   // label + human-readable reason`;

const MCP_EXAMPLE = `const packet = await mcp.callTool("qveris_earnings_analyze", {
  ticker: "NVDA",
  mode: "auto",
  includeSources: true,
  includeTranscript: true,
});

return {
  summary: packet.analysis.summaryBullets,
  sources: packet.sources,
  missing: packet.missing,
  confidence: packet.analysis.confidence,
};`;

const PROMPT_TEMPLATE = `Use only the earnings packet JSON.
Required inputs: sources, missing, analysis.confidence.
If a numeric field has no sourceIds resolving to sources, say unavailable.
Mention missing capabilities and confidence.reason. No investment advice.`;

const LAYERS = {
  capability: [
    ["Calendar", "sage"],
    ["Results", "blue"],
    ["Estimates", "amber"],
    ["Financials", "sage"],
    ["Segments", "amber"],
    ["Filings", "slate"],
    ["News", "plum"],
    ["Transcript", "rose"],
  ],
  surfaces: [
    ["Web UI", "blue"],
    ["Share Page", "plum"],
    ["API JSON", "sage"],
  ],
};

const HERO_RECEIPT = [
  ["ticker", "NVDA"],
  ["sources", "calendar · results · filings · news"],
  ["missing", "transcript"],
  ["confidence", "medium"],
];

const WORKFLOW_PHASES = [
  { title: "Setup", desc: "Event, consensus, history, and pre-print debates", items: [0] },
  { title: "Print + variance", desc: "Actuals, financials, segments, and surprise checks", items: [1, 2] },
  { title: "Call + thesis", desc: "Transcript signals and assumption changes", items: [3, 4] },
  { title: "Audit + output", desc: "Quality flags, source audit, and reusable surfaces", items: [5, 6, 7] },
];

export default async function DevelopersPage() {
  const { t } = await getDict();
  return (
    <div className="space-y-24 pb-16">
      <section className="dev-hero rise rise-1 mx-auto grid max-w-6xl items-end gap-10 pt-16 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="label text-accent">{t.dev.kicker}</p>
          <h1 className="mt-5 max-w-3xl font-display text-5xl leading-[0.98] text-ink sm:text-7xl">
            {t.dev.heroPre}
            <em className="text-accent">{t.dev.heroEm}</em>
            {t.dev.heroPost}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">{t.dev.heroSub}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {["Source cited", "Gap aware", "Agent ready"].map((item) => (
              <span key={item} className="dev-chip">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="dev-receipt">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <span className="label text-accent">analysis packet</span>
            <span className="num text-xs text-ink-faint">POST /analyze</span>
          </div>
          <div className="p-5">
            {HERO_RECEIPT.map(([key, value]) => (
              <div key={key} className="dev-receipt-row">
                <span>{key}</span>
                <code>{value}</code>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 lg:col-span-2 lg:-mt-4">
          <a
            href="https://qveris.ai"
            target="_blank"
            rel="noreferrer"
            className="label border border-accent bg-accent px-5 py-2.5 !text-white shadow-lg shadow-accent/15 transition-colors hover:bg-ink"
          >
            {t.dev.ctaKey}
          </a>
          <Link
            href="/earnings/NVDA"
            className="label border border-line-strong bg-surface px-5 py-2.5 text-ink-soft transition-colors hover:border-accent hover:text-accent"
          >
            {t.dev.ctaLive}
          </Link>
        </div>
      </section>

      {/* the workflow — capability layer -> workflow core -> surfaces */}
      <section className="mx-auto max-w-6xl">
          <h2 className="label mb-5 text-center text-accent">{t.dev.workflowTitle}</h2>
          <div className="workflow-shell relative overflow-hidden px-5 py-7 sm:px-8">
            <WorkflowLines />

            <div className="relative z-10 space-y-8">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                  <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                  <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                </span>
                <p className="label">{t.dev.capabilityTitle}</p>
                <p className="label text-accent">configured</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                {LAYERS.capability.map(([item, tone], i) => (
                  <div key={item} className="workflow-node" data-tone={tone}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{item}</p>
                      <span className="workflow-led" />
                    </div>
                    <p className="label mt-1 normal-case tracking-normal">{i < 3 ? "figures" : "context"}</p>
                  </div>
                ))}
              </div>

              <div className="workflow-core mx-auto max-w-3xl">
                <div className="border-b border-line px-5 py-4 sm:px-6">
                  <p className="label text-accent">QVeris earnings research workflow</p>
                </div>
                <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto_1fr] sm:p-6">
                  <div className="space-y-3">
                    {WORKFLOW_PHASES.map((phase, i) => (
                      <details key={phase.title} className="workflow-phase" open={i === 0}>
                        <summary>
                          <span className="flow-pulse num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent-dim bg-surface text-xs text-accent">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span>
                            <span className="label block text-ink">{phase.title}</span>
                            <span className="mt-1 block text-sm leading-relaxed text-ink-soft">
                              {phase.desc}
                            </span>
                          </span>
                        </summary>
                        <ol className="mt-3 space-y-2 pl-11">
                          {phase.items.map((item) => (
                            <li key={t.dev.workflow[item].step} className="text-sm leading-relaxed text-ink-soft">
                              {t.dev.workflow[item].desc}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ))}
                  </div>
                  <div className="hidden w-px bg-line sm:block" />
                  <div className="workflow-payload">
                    <p className="label text-accent">Validated payload</p>
                    <div className="mt-4 space-y-3">
                      {["varianceTable", "callSignals", "thesisImpact", "qualityFlags", "sourceIds"].map((item, i) => (
                        <div key={item} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                          <code className="num text-sm text-ink">{item}</code>
                          <span className="payload-bar" data-step={i + 1} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mx-auto grid max-w-3xl gap-2 sm:grid-cols-3">
                {LAYERS.surfaces.map(([item, tone]) => (
                  <div key={item} className="workflow-node" data-tone={tone}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{item}</p>
                      <span className="workflow-led" />
                    </div>
                    <p className="label mt-1 normal-case tracking-normal">output</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="label mt-7 text-center normal-case tracking-normal">{t.dev.workflowFootnote}</p>
          </div>
      </section>

      {/* capability map */}
      <section className="mx-auto max-w-3xl">
          <h2 className="label mb-6 text-center text-accent">{t.dev.capabilityTitle}</h2>
          <div className="panel divide-y divide-line">
            {t.dev.capabilities.map(([name, desc]) => (
              <div key={name} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 py-3.5">
                <code className="num w-44 shrink-0 text-sm text-accent">{name}</code>
                <span className="text-sm text-ink-soft">{desc}</span>
              </div>
            ))}
          </div>
      </section>

      {/* code examples */}
      <section className="mx-auto max-w-5xl space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <CodeBlock title={t.dev.exampleRequest} code={CURL_EXAMPLE} copy={t.copy.copy} copied={t.copy.copied} />
          <CodeBlock title={t.dev.exampleResponse} code={JSON_EXAMPLE} copy={t.copy.copy} copied={t.copy.copied} />
        </div>
        <CodeBlock title={t.dev.exampleTs} code={TS_EXAMPLE} copy={t.copy.copy} copied={t.copy.copied} />
        <div className="grid gap-6 lg:grid-cols-2">
          <CodeBlock title={t.dev.exampleMcp} code={MCP_EXAMPLE} copy={t.copy.copy} copied={t.copy.copied} />
          <CodeBlock title={t.dev.examplePrompt} code={PROMPT_TEMPLATE} copy={t.copy.copy} copied={t.copy.copied} />
        </div>
      </section>

      {/* audit & confidence model */}
      <section className="mx-auto max-w-5xl p-0">
          <h2 className="font-display text-3xl italic text-ink">{t.dev.auditTitle}</h2>
          <div className="mt-6 grid gap-4 text-sm text-ink-soft md:grid-cols-3">
            <div className="audit-card" data-tone="blue">
              <h3 className="label mb-2 text-accent">{t.dev.auditSourcesTitle}</h3>
              <p className="leading-relaxed">{t.dev.auditSourcesBody}</p>
            </div>
            <div className="audit-card" data-tone="amber">
              <h3 className="label mb-2 text-accent">{t.dev.auditGapsTitle}</h3>
              <p className="leading-relaxed">{t.dev.auditGapsBody}</p>
            </div>
            <div className="audit-card" data-tone="plum">
              <h3 className="label mb-2 text-accent">{t.dev.auditConfidenceTitle}</h3>
              <p className="leading-relaxed">{t.dev.auditConfidenceBody}</p>
            </div>
          </div>
          <p className="label mt-8">{t.dev.auditFootnote}</p>
      </section>

      {/* closing CTA */}
      <section className="mx-auto max-w-3xl py-6 text-center">
          <p className="font-display text-4xl italic text-ink">{t.dev.ctaTitle}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="https://qveris.ai"
              target="_blank"
              rel="noreferrer"
              className="label border border-accent bg-accent px-5 py-2.5 !text-white shadow-lg shadow-accent/15 transition-colors hover:bg-ink"
            >
              {t.dev.ctaKey}
            </a>
            <Link
              href="/earnings/NVDA"
              className="label border border-line-strong px-5 py-2.5 text-ink-soft transition-colors hover:border-accent hover:text-accent"
            >
              {t.dev.ctaLive}
            </Link>
          </div>
      </section>
    </div>
  );
}

function WorkflowLines() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full text-accent-dim" aria-hidden>
      <line className="flow-line" x1="15%" y1="33%" x2="85%" y2="33%" stroke="currentColor" strokeWidth="1" />
      <line className="flow-line flow-dot" x1="50%" y1="33%" x2="50%" y2="45%" stroke="currentColor" strokeWidth="1" />
      <line className="flow-line flow-dot" x1="50%" y1="71%" x2="50%" y2="84%" stroke="currentColor" strokeWidth="1" />
      <line className="flow-line" x1="20%" y1="84%" x2="80%" y2="84%" stroke="currentColor" strokeWidth="1" />
      <circle className="flow-pulse" cx="50%" cy="45%" r="3" fill="currentColor" />
      <circle className="flow-pulse" cx="50%" cy="84%" r="3" fill="currentColor" />
    </svg>
  );
}
