import assert from "node:assert/strict";
import test from "node:test";
import { sampleAnalysis } from "@/app/api/earnings/_testAnalysis";
import type { EarningsAnalysis, EarningsClaimSourceIds } from "@/lib/earnings/types";
import { buildShareImageSvg } from "@/lib/share/shareImage";
import { buildShareMarkdown, buildShareMetrics, buildShareSupportingBullets } from "./shareCard";

test("share metrics and SVG hide figures and verdicts without field sources", () => {
  const base = sampleAnalysis();
  const analysis = sampleAnalysis({
    results: {
      ...base.results!,
      guidanceText: "Management raised revenue guidance.",
      fieldSourceIds: { revenueActual: [], epsActual: [], guidanceText: [] },
    },
    estimates: {
      ...base.estimates!,
      fieldSourceIds: { revenueEstimate: [], epsEstimate: [] },
    },
    marketReaction: {
      eventDate: "2026-02-01",
      baselineSessionDate: "2026-01-31",
      reactionSessionDate: "2026-02-02",
      basis: "next_session",
      closeChangePct: 5.2,
      sourceIds: [],
    },
    beatMiss: { revenue: "beat", eps: "beat", guidance: "raised" },
  });

  const metrics = buildShareMetrics(analysis);
  assert.equal(metrics.revenue.actual, "unavailable");
  assert.equal(metrics.revenue.estimate, "unavailable");
  assert.equal(metrics.revenue.verdict, undefined);
  assert.equal(metrics.eps.actual, "unavailable");
  assert.equal(metrics.eps.estimate, "unavailable");
  assert.equal(metrics.eps.verdict, undefined);
  assert.equal(metrics.reaction.value, "unavailable");
  assert.equal(metrics.guidance.value, "unavailable");

  const svg = buildShareImageSvg(analysis);
  assert.doesNotMatch(svg, /\$110|\$100|\$2\.20|\$2\.00|\+5\.2%|beat|raised/);
});

test("share metrics do not fall back to aggregate sourceIds for field-gated facts", () => {
  const base = sampleAnalysis();
  const analysis = sampleAnalysis({
    results: {
      ...base.results!,
      guidanceText: "Management raised revenue guidance.",
      sourceIds: ["src-1"],
    },
    estimates: {
      ...base.estimates!,
      sourceIds: ["src-1"],
    },
    marketReaction: {
      eventDate: "2026-02-01",
      baselineSessionDate: "2026-01-31",
      reactionSessionDate: "2026-02-02",
      basis: "next_session",
      closeChangePct: 5.2,
      sourceIds: ["src-1"],
    },
    beatMiss: { revenue: "beat", eps: "beat", guidance: "raised" },
  });

  const metrics = buildShareMetrics(analysis);
  assert.equal(metrics.revenue.actual, "unavailable");
  assert.equal(metrics.revenue.estimate, "unavailable");
  assert.equal(metrics.revenue.verdict, undefined);
  assert.equal(metrics.eps.actual, "unavailable");
  assert.equal(metrics.eps.estimate, "unavailable");
  assert.equal(metrics.eps.verdict, undefined);
  assert.equal(metrics.guidance.value, "unavailable");
  assert.equal(metrics.reaction.value, "+5.2%");
});

test("share narrative stays hidden when old snapshots lack claimSourceIds", () => {
  const analysis = sampleAnalysis();

  assert.deepEqual(buildShareSupportingBullets(analysis), []);
  assert.doesNotMatch(buildShareMarkdown(analysis), /Datacenter demand remained strong/);
});

test("share markdown cites sourced claim bullets and omits unsourced facts", () => {
  const analysis = {
    ...sampleAnalysis({
      summaryBullets: ["Sourced claim.", "Unsourced claim."],
      keyDrivers: ["Driver with source."],
      qualityOfEarnings: [],
      missing: ["transcript"],
      sources: [
        { id: "src-1", title: "NVIDIA earnings release", url: "https://example.com/release", retrievedAt: "2026-02-01T12:00:00.000Z" },
        { id: "src-2", title: "Market reaction", retrievedAt: "2026-02-01T12:00:00.000Z" },
      ],
    }),
    claimSourceIds: claimSourceIds({
      summaryBullets: [["src-1"], "unavailable"],
      keyDrivers: [["src-2"]],
    }),
  } as EarningsAnalysis;

  assert.deepEqual(buildShareSupportingBullets(analysis), [
    { text: "Sourced claim.", sourceIds: ["src-1"] },
    { text: "Driver with source.", sourceIds: ["src-2"] },
  ]);

  const markdown = buildShareMarkdown(analysis);
  assert.match(markdown, /Sourced claim\. \[1\]/);
  assert.match(markdown, /Driver with source\. \[2\]/);
  assert.doesNotMatch(markdown, /Unsourced claim/);
  assert.match(markdown, /Confidence: medium - Stored test analysis\./);
  assert.match(markdown, /Missing: transcript/);
  assert.match(markdown, /\[1\] NVIDIA earnings release - https:\/\/example\.com\/release/);
});

function claimSourceIds(overrides: Partial<EarningsClaimSourceIds> = {}): EarningsClaimSourceIds {
  return {
    oneLineVerdict: "unavailable",
    summaryBullets: [],
    keyDrivers: [],
    riskSignals: [],
    qualityOfEarnings: [],
    watchNext: [],
    ...overrides,
  };
}
