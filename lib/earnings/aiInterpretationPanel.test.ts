import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiInterpretationPanel } from "@/components/earnings/AiInterpretationPanel";
import type { EarningsInterpretation } from "@/lib/earnings/types";

const sources = [{ id: "filing", title: "10-Q", retrievedAt: "2026-07-22T00:00:00Z" }];

test("renders sourced company interpretation without an ecosystem tab", () => {
  const html = render({
    status: "available",
    mode: "company",
    conclusion: claim("Margin expanded."),
    companyDrivers: [claim("Higher mix.")],
    transmissionChain: [],
    counterEvidence: [],
    watchItems: [],
    confidence: { label: "medium", reason: "One reported quarter." },
    reason: "One reported quarter.",
  });

  assert.match(html, /Company read/);
  assert.doesNotMatch(html, /Industry transmission/);
  assert.match(html, /Margin expanded\.<sup class="cite"[^>]*>\[1\]<\/sup>/);
  assert.match(html, /Evidence · fact/);
});

test("renders a responsive ecosystem transmission chain with cited evidence", () => {
  const html = render({
    status: "available",
    mode: "ecosystem",
    companyDrivers: [],
    counterEvidence: [],
    watchItems: [],
    transmissionChain: [{
      text: "AI server demand raises memory content per system.",
      from: "AI server demand",
      to: "Memory revenue",
      relation: "raises content per system",
      lag: "1–2 quarters",
      evidenceType: "fact",
      sourceIds: ["filing"],
      confidence: "high",
    }],
    confidence: { label: "high", reason: "Direct filing evidence." },
    reason: "Direct filing evidence.",
  });

  assert.match(html, /Industry transmission/);
  assert.match(html, /Evidence: fact<sup class="cite"[^>]*>\[1\]<\/sup>/);
  assert.match(html, /sm:flex-row/);
});

test("renders a restrained unavailable state", () => {
  const html = render({
    status: "unavailable",
    mode: "company",
    companyDrivers: [],
    transmissionChain: [],
    counterEvidence: [],
    watchItems: [],
    confidence: { label: "low", reason: "Transcript is unavailable." },
    reason: "Transcript is unavailable.",
  });

  assert.match(html, /No evidence-backed AI interpretation is available/);
  assert.match(html, /Transcript is unavailable/);
});

function claim(text: string) {
  return { text, evidenceType: "fact" as const, sourceIds: ["filing"], confidence: "high" as const };
}

function render(interpretation: EarningsInterpretation) {
  return renderToStaticMarkup(React.createElement(AiInterpretationPanel, { interpretation, sources, language: "en" }));
}
