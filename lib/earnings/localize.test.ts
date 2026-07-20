import assert from "node:assert/strict";
import test from "node:test";
import { localizeGuidanceText, localizeTranscript } from "@/lib/earnings/localize";

test("numeric guidance is rendered in Chinese without changing values", () => {
  const localized = localizeGuidanceText(
    "Now turning to guidance: we expect fiscal Q4 revenue to be a record $50 billion, plus or minus $1 billion; gross margin to be approximately 86%; and operating expenses to be approximately $1.65 billion. Based on a share count of approximately 1.15 billion diluted shares, we expect EPS to be a record $31 per share, plus or minus $1.",
    "zh",
    2026,
  );
  assert.equal(localized, "2026 财年Q4指引：营收 $50B（±$1B）；毛利率约 86%；运营费用约 $1.65B；EPS $31（±$1）。");
});

test("transcript localization preserves sourced questions and answers verbatim", () => {
  const transcript = {
    available: true,
    repeatedQuestions: ["How are AI investments affecting expenses?"],
    managementAnswers: [{ topic: "AI investment", answer: "We are measuring returns by business line.", sourceIds: ["call"] }],
    sourceIds: ["call"],
  };
  const localized = localizeTranscript(transcript, "zh");
  assert.deepEqual(localized, transcript);
});
