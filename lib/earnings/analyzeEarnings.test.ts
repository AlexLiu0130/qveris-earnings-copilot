import assert from "node:assert/strict";
import test from "node:test";
import { MockEarningsCapabilityProvider } from "@/lib/capabilities/MockEarningsCapabilityProvider";
import { analyzeEarnings } from "@/lib/earnings/analyzeEarnings";

test("mock analysis returns source-aware combined payload", async () => {
  const analysis = await analyzeEarnings(
    { ticker: "NVDA", mode: "auto", includeTranscript: true, includeAiSummary: false },
    new MockEarningsCapabilityProvider(),
  );
  assert.equal(analysis.ticker, "NVDA");
  assert.equal(analysis.mode, "combined");
  assert.ok(analysis.analysisId.startsWith("NVDA-combined-"));
  assert.ok(analysis.sources.length >= 3);
  assert.equal(analysis.capabilityStatus.transcript, "demo");
  assert.equal(analysis.demo, true);
});

test("mock analysis keeps transcript absence explicit", async () => {
  const analysis = await analyzeEarnings(
    { ticker: "TSLA", mode: "auto", includeTranscript: true, includeAiSummary: false },
    new MockEarningsCapabilityProvider(),
  );
  assert.equal(analysis.transcript?.available, false);
  assert.equal(analysis.capabilityStatus.transcript, "unavailable");
  assert.ok(analysis.missing.includes("transcript"));
});

test("mock analysis follows Chinese narrative language", async () => {
  const analysis = await analyzeEarnings(
    { ticker: "NVDA", mode: "auto", language: "zh", includeTranscript: true, includeAiSummary: false },
    new MockEarningsCapabilityProvider(),
  );
  assert.equal(analysis.language, "zh");
  assert.match(analysis.summaryBullets[0], /[\u3400-\u9fff]/);
  assert.match(analysis.keyDrivers[0], /[\u3400-\u9fff]/);
  assert.match(analysis.confidence.reason, /[\u3400-\u9fff]/);
  assert.ok(analysis.transcript?.repeatedQuestions?.every((item) => /[\u3400-\u9fff]/.test(item)));
});
