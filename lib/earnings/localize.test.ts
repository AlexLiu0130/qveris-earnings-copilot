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

test("guidance localization keeps revenue-growth, NII, and expense-outlook values", () => {
  assert.equal(
    localizeGuidanceText("We are guiding to 12% revenue growth in Q3 reported, 11% FX neutral. So forecasting content expense up about 10% this year.", "zh", 2026),
    "2026 财年Q3指引：营收增长 12%（报告口径） / 11%（固定汇率口径）；内容费用增长约 10%。",
  );
  assert.equal(
    localizeGuidanceText("In terms of the full year 2026 outlook, we now expect NII ex-Markets to be about $96.5 billion, and total NII to be approximately $105.5 billion as a function of markets NII increasing to about $9 billion. The new adjusted expense outlook is about $107.5 billion.", "zh", 2026),
    "2026 全年指引：非市场 NII 约 $96.5B；总 NII 约 $105.5B；市场 NII 约 $9B；调整后费用展望约 $107.5B。",
  );
});

test("multi-period euro guidance keeps each range and period", () => {
  assert.equal(
    localizeGuidanceText("Q3 2026 total net sales are expected between €11.0 billion and €12.0 billion, with gross margin between 55% and 57%. Full-year 2026 total net sales are expected between €43 billion and €45 billion, with gross margin between 54% and 56%.", "zh", 2026),
    "2026 财年Q3指引：营收 €11.0B–€12.0B；毛利率 55%–57%。2026 全年指引：营收 €43B–€45B；毛利率 54%–56%。",
  );
});

test("range guidance keeps operating margin", () => {
  assert.equal(
    localizeGuidanceText("Q3 2026 net revenue is expected between $44.6 billion and $45.8 billion, with gross margin between 65% and 67% and operating margin between 56% and 58%.", "zh", 2026),
    "2026 财年Q3指引：营收 $44.6B–$45.8B；毛利率 65%–67%；营业利润率 56%–58%。",
  );
});

test("unstructured guidance keeps its original sentence instead of a generic placeholder", () => {
  assert.equal(
    localizeGuidanceText("Management expects market conditions to remain supportive.", "zh", 2026),
    "业绩指引原文：Management expects market conditions to remain supportive.",
  );
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
