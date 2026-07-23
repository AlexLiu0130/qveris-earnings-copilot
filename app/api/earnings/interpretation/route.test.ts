import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "@/app/api/earnings/interpretation/route";
import { sampleAnalysis } from "@/app/api/earnings/_testAnalysis";
import { __clearAnalysisStoreForTests, getAnalysisById, saveAnalysis } from "@/lib/earnings/analysisStore";
import { __setD1ForTests } from "@/lib/storage/d1";

test("interpretation route generates from the exact stored snapshot", async (t) => {
  __clearAnalysisStoreForTests();
  __setD1ForTests(null);
  const oldDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  const oldKey = process.env.OPENAI_API_KEY;
  const oldBase = process.env.OPENAI_BASE_URL;
  const oldFetch = globalThis.fetch;
  t.after(() => {
    restore("DEEPSEEK_API_KEY", oldDeepSeekKey);
    restore("OPENAI_API_KEY", oldKey);
    restore("OPENAI_BASE_URL", oldBase);
    globalThis.fetch = oldFetch;
    __setD1ForTests(undefined);
  });
  delete process.env.DEEPSEEK_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_BASE_URL = "https://ai.test";
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      mode: "company",
      conclusion: { text: "Revenue may remain uncertain.", evidenceType: "inference", sourceIds: ["src-1"], confidence: "medium" },
      companyDrivers: [],
      transmissionChain: [],
      counterEvidence: [],
      watchItems: [],
      confidence: "medium",
    }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const base = sampleAnalysis();
  await saveAnalysis({ ticker: base.ticker, includeAiInterpretation: false }, base);
  const response = await POST(new Request("http://localhost/api/earnings/interpretation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId: base.analysisId }),
  }));
  const body = await response.json() as { analysisId: string; sources: Array<{ id: string }>; interpretation: { status: string } };

  assert.equal(response.status, 200);
  assert.notEqual(body.analysisId, base.analysisId);
  assert.deepEqual(body.sources.map((source) => source.id), base.sources.map((source) => source.id));
  assert.equal(body.interpretation.status, "available");
  assert.equal((await getAnalysisById(body.analysisId))?.interpretation?.status, "available");

  const repeated = await POST(new Request("http://localhost/api/earnings/interpretation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId: base.analysisId }),
  }));
  const repeatedBody = await repeated.json() as { analysisId: string; cache: { hit: boolean } };
  assert.equal(repeatedBody.analysisId, body.analysisId);
  assert.equal(repeatedBody.cache.hit, true);
  assert.equal(fetchCount, 1);
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
