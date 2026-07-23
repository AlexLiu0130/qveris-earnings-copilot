import assert from "node:assert/strict";
import test from "node:test";
import { generateAiInterpretation } from "@/lib/earnings/aiInterpretation";
import type { EarningsAnalysis, SourceRef } from "@/lib/earnings/types";

const source = (id: string): SourceRef => ({ id, title: id, retrievedAt: "2026-07-22T00:00:00.000Z" });
const base = (overrides: Partial<EarningsAnalysis> = {}) => ({
  ticker: "STREAM",
  language: "en" as const,
  mode: "combined" as const,
  company: { ticker: "STREAM", name: "Stream Co", sourceIds: ["company"] },
  event: null,
  estimates: null,
  results: { ticker: "STREAM", guidanceText: "Content expense growth remains disciplined.", sourceIds: ["results"] },
  financials: [],
  segmentRevenue: [],
  news: [],
  filings: [],
  transcript: null,
  sources: [source("company"), source("results")],
  ...overrides,
} satisfies Parameters<typeof generateAiInterpretation>[0]);

test("NFLX-like evidence remains company mode", async (t) => {
  await withAi(t, JSON.stringify({
    mode: "ecosystem",
    archetype: "subscription media",
    conclusion: { text: "Content expense discipline supports company execution.", evidenceType: "fact", sourceIds: ["results"], confidence: "high" },
    transmissionChain: [{ from: "Stream Co", to: "vendors", relation: "spending", lag: "next quarter", text: "Unsupported chain.", evidenceType: "inference", sourceIds: ["results"], confidence: "low" }],
  }), async () => {
    const result = await generateAiInterpretation(base());
    assert.equal(result.status, "available");
    assert.equal(result.mode, "company");
    assert.deepEqual(result.transmissionChain, []);
  });
});

test("GOOG-like explicit capex evidence permits ecosystem mode", async (t) => {
  await withAi(t, JSON.stringify({
    mode: "ecosystem",
    archetype: "cloud platform infrastructure",
    conclusion: { text: "Capital expenditure supports infrastructure expansion.", evidenceType: "fact", sourceIds: ["results"], confidence: "high" },
    transmissionChain: [{ from: "Infrastructure capacity", to: "Semiconductor and data-center infrastructure demand", relation: "capacity may affect infrastructure demand", lag: "over coming quarters", text: "Infrastructure investment may transmit to semiconductor and data-center demand.", evidenceType: "inference", sourceIds: ["results"], confidence: "medium" }],
    confidence: "medium",
  }), async () => {
    const result = await generateAiInterpretation(base({
      ticker: "PLATFORM",
      company: { ticker: "PLATFORM", name: "Platform Co", sourceIds: ["company"] },
      results: { ticker: "PLATFORM", guidanceText: "Capital expenditure supports cloud infrastructure capacity.", sourceIds: ["results"] },
    }));
    assert.equal(result.mode, "ecosystem");
    assert.equal(result.transmissionChain.length, 1);
    assert.equal(result.transmissionChain[0]?.to, "Semiconductor and data-center infrastructure demand");
  });
});

test("industry acronyms present in evidence are not rejected as invented tickers", async (t) => {
  await withAi(t, JSON.stringify({
    mode: "company",
    conclusion: { text: "EUV demand supports the reported outlook.", evidenceType: "inference", sourceIds: ["results"], confidence: "medium" },
  }), async () => {
    const result = await generateAiInterpretation(base({
      results: { ticker: "STREAM", guidanceText: "EUV demand supports the reported outlook.", sourceIds: ["results"] },
    }));
    assert.equal(result.status, "available");
    assert.match(result.conclusion?.text ?? "", /EUV/);
  });
});

test("fenced model JSON is parsed without dropping the interpretation", async (t) => {
  await withAi(t, `\`\`\`json\n${JSON.stringify({
    mode: "company",
    conclusion: { text: "Content expense growth remains disciplined.", evidenceType: "fact", sourceIds: ["results"], confidence: "high" },
  })}\n\`\`\``, async () => {
    const result = await generateAiInterpretation(base());
    assert.equal(result.status, "available");
    assert.equal(result.mode, "company");
  });
});

test("malformed model JSON degrades after one bounded model call", async (t) => {
  await withAi(t, ["{", JSON.stringify({
    mode: "company",
    conclusion: { text: "Content expense growth remains disciplined.", evidenceType: "fact", sourceIds: ["results"], confidence: "high" },
  })], async () => {
    const result = await generateAiInterpretation(base());
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "AI_INTERPRETATION_UNAVAILABLE");
  });
});

test("MU remains company-only when the snapshot has no sourced relationship evidence", async (t) => {
  await withAi(t, JSON.stringify({
    mode: "ecosystem",
    role: "upstream_supplier",
    archetype: "memory cycle",
    conclusion: { text: "Micron reported revenue above available consensus.", evidenceType: "inference", sourceIds: ["mu-results", "mu-estimates"], confidence: "medium" },
    companyDrivers: [],
    transmissionChain: [{ from: "AI and data-center demand", to: "Memory demand and product mix", relation: "demand", lag: "1-2 quarters", evidenceType: "inference", sourceIds: ["mu-results"], confidence: "medium" }],
    counterEvidence: [],
    watchItems: [],
    confidence: "medium",
  }), async () => {
    const result = await generateAiInterpretation(base({
      ticker: "MU",
      company: { ticker: "MU", name: "Micron Technology", sector: "Technology", industry: "Semiconductors", sourceIds: ["mu-company"] },
      event: { id: "MU-2026-06-24", ticker: "MU", fiscalPeriod: "Q3", fiscalYear: 2026, reportDate: "2026-06-24", timing: "after_close", status: "reported", sourceIds: ["mu-results"] },
      estimates: { ticker: "MU", revenueEstimate: 8_900_000_000, epsEstimate: 1.60, sourceIds: ["mu-estimates"] },
      results: { ticker: "MU", revenueActual: 9_370_000_000, epsActual: 1.91, sourceIds: ["mu-results"] },
      sources: [source("mu-company"), source("mu-results"), source("mu-estimates")],
    }));
    assert.equal(result.status, "available");
    assert.equal(result.role, "company_only");
    assert.equal(result.mode, "company");
    assert.deepEqual(result.transmissionChain, []);
  });
});

test("MU routes to upstream supplier only with sourced HBM and AI-demand evidence", async (t) => {
  await withAi(t, JSON.stringify({
    mode: "ecosystem",
    role: "upstream_supplier",
    archetype: "memory supplier",
    conclusion: { text: "HBM demand from AI data centers supports product mix, subject to supply and pricing validation.", evidenceType: "inference", sourceIds: ["mu-call"], confidence: "medium" },
    companyDrivers: [{ text: "Management linked HBM shipments with AI data-center customer demand.", evidenceType: "inference", sourceIds: ["mu-call"], confidence: "medium" }],
    transmissionChain: [
      { from: "AI and data-center demand", to: "Memory demand and product mix", relation: "demand", lag: "0-1 quarter", evidenceType: "inference", sourceIds: ["mu-call"], confidence: "medium" },
      { from: "Memory demand and product mix", to: "Micron Technology", relation: "pricing", lag: "1-2 quarters", evidenceType: "inference", sourceIds: ["mu-call"], confidence: "medium" },
    ],
    counterEvidence: [{ text: "Supply growth or weaker pricing could offset demand strength.", evidenceType: "inference", sourceIds: ["mu-call"], confidence: "low" }],
    watchItems: [{ text: "Verify HBM shipments, pricing, inventory, and gross margin next quarter.", evidenceType: "to_verify", sourceIds: ["mu-call"], confidence: "low", lag: "next quarter" }],
    confidence: "medium",
  }), async () => {
    const result = await generateAiInterpretation(base({
      ticker: "MU",
      company: { ticker: "MU", name: "Micron Technology", sector: "Technology", industry: "Semiconductors", sourceIds: ["mu-company"] },
      event: { id: "MU-2026-06-24", ticker: "MU", fiscalPeriod: "Q3", fiscalYear: 2026, reportDate: "2026-06-24", timing: "after_close", status: "reported", sourceIds: ["mu-results"] },
      estimates: { ticker: "MU", revenueEstimate: 8_900_000_000, epsEstimate: 1.60, sourceIds: ["mu-estimates"] },
      results: { ticker: "MU", revenueActual: 9_370_000_000, epsActual: 1.91, sourceIds: ["mu-results"] },
      transcript: {
        available: true,
        managementAnswers: [{ topic: "HBM", answer: "HBM shipments are expanding with AI data-center customer demand while supply and pricing remain key variables.", sourceIds: ["mu-call"] }],
        sourceIds: ["mu-call"],
      },
      sources: [source("mu-company"), source("mu-results"), source("mu-estimates"), source("mu-call")],
    }));
    assert.equal(result.status, "available");
    assert.equal(result.role, "upstream_supplier");
    assert.equal(result.mode, "ecosystem");
    assert.equal(result.transmissionChain.length, 2);
    assert.equal(result.watchItems[0]?.evidenceType, "to_verify");
    assert.ok(result.transmissionChain.every((edge) => Array.isArray(edge.sourceIds) && edge.sourceIds.includes("mu-call")));
  });
});

test("unknown source ids are discarded and uncited facts are rejected", async (t) => {
  await withAi(t, JSON.stringify({
    conclusion: { text: "Unsupported fact.", evidenceType: "fact", sourceIds: ["unknown"], confidence: "high" },
  }), async () => {
    const result = await generateAiInterpretation(base());
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "AI_INTERPRETATION_INVALID");
  });
});

test("a known but unrelated source cannot authorize a fact label", async (t) => {
  await withAi(t, JSON.stringify({
    mode: "company",
    conclusion: { text: "Content expense growth remains disciplined.", evidenceType: "fact", sourceIds: ["company"], confidence: "high" },
  }), async () => {
    const result = await generateAiInterpretation(base());
    assert.equal(result.status, "available");
    assert.equal(result.conclusion?.evidenceType, "inference");
    assert.equal(result.conclusion?.confidence, "medium");
  });
});

test("valid source ids cannot authorize invented external tickers or transmission nodes", async (t) => {
  await withAi(t, JSON.stringify({
    mode: "ecosystem",
    conclusion: { text: "Nvidia will benefit from this spending.", evidenceType: "inference", sourceIds: ["results"], confidence: "high" },
    transmissionChain: [{ from: "Platform Co", to: "Nvidia", relation: "procurement", lag: "next quarter", text: "Nvidia demand rises.", evidenceType: "inference", sourceIds: ["results"], confidence: "high" }],
  }), async () => {
    const result = await generateAiInterpretation(base({
      ticker: "PLATFORM",
      company: { ticker: "PLATFORM", name: "Platform Co", sourceIds: ["company"] },
      results: { ticker: "PLATFORM", guidanceText: "Capital expenditure supports cloud infrastructure capacity.", sourceIds: ["results"] },
    }));
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "AI_INTERPRETATION_INVALID");
  });
});

test("AI API failure is explicitly unavailable", async (t) => {
  await withAi(t, "", async () => {
    const result = await generateAiInterpretation(base());
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "AI_INTERPRETATION_UNAVAILABLE");
  }, 503);
});

test("reported results fall back to validated fields when the model fails", async (t) => {
  await withAi(t, "", async () => {
    const result = await generateAiInterpretation(base({
      event: { id: "evt", ticker: "STREAM", reportDate: "2026-07-22", timing: "after_close", status: "reported", sourceIds: ["results"] },
      results: { ticker: "STREAM", revenueActual: 10, epsActual: 2, sourceIds: ["results"], fieldSourceIds: { revenueActual: ["results"], epsActual: ["results"] } },
    }));
    assert.equal(result.status, "available");
    assert.equal(result.archetype, "conservative evidence read");
    assert.deepEqual(result.conclusion?.sourceIds, ["results"]);
  }, 503);
});

test("missing AI key is explicitly unavailable", async () => {
  const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  try {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const result = await generateAiInterpretation(base());
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "AI_INTERPRETATION_UNAVAILABLE");
  } finally {
    if (deepSeekApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = deepSeekApiKey;
    if (apiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = apiKey;
  }
});

test("missing citable event evidence does not spend a model call", async (t) => {
  const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  const fetch = globalThis.fetch;
  let calls = 0;
  delete process.env.DEEPSEEK_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("", { status: 500 });
  };
  t.after(() => {
    if (deepSeekApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = deepSeekApiKey;
    if (apiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = apiKey;
    globalThis.fetch = fetch;
  });
  const result = await generateAiInterpretation(base({ sources: [] }));
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "AI_INTERPRETATION_EVIDENCE_INSUFFICIENT");
  assert.equal(calls, 0);
});

test("no-event analyses do not generate an earnings interpretation", async () => {
  const result = await generateAiInterpretation(base({ mode: "no_event", event: null, results: null }));
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "AI_INTERPRETATION_EVIDENCE_INSUFFICIENT");
});

async function withAi(t: test.TestContext, content: string | string[], run: () => Promise<void>, status = 200) {
  const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  const fetch = globalThis.fetch;
  delete process.env.DEEPSEEK_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_BASE_URL = "https://ai.test";
  const responses = Array.isArray(content) ? [...content] : [content];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.ok(JSON.parse(body.messages[1].content).validatedSignals);
    const next = responses.length > 1 ? responses.shift()! : responses[0];
    return new Response(next ? JSON.stringify({ choices: [{ message: { content: next } }] }) : "", { status });
  };
  t.after(() => {
    if (deepSeekApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = deepSeekApiKey;
    if (apiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = apiKey;
    if (baseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = baseUrl;
    globalThis.fetch = fetch;
  });
  await run();
}
