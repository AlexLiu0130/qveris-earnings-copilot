import type { CompanyProfile, FilingItem, HistoricalEarnings, NewsItem } from "@/lib/earnings/types";
import type { Lang } from "@/lib/i18n/dict";

const GENERIC = [
  "Did revenue growth accelerate or decelerate versus recent quarters?",
  "Did margins improve or deteriorate, and what drove the change?",
  "Did management raise, lower, or maintain guidance?",
  "Which business segment or KPI drove the result?",
  "What risks did management emphasize, and did that language change?",
];

const GENERIC_ZH = [
  "营收增速较近期季度是加速还是放缓？",
  "利润率改善还是恶化，主要驱动因素是什么？",
  "管理层上调、下调还是维持了业绩指引？",
  "哪个业务分部或关键指标主导了本季表现？",
  "管理层重点强调了哪些风险，相关措辞是否发生变化？",
];

const SECTOR_QUESTIONS: Record<string, string[]> = {
  semiconductors: [
    "How did data center demand and AI accelerator supply shape the quarter?",
    "What happened to gross margin, inventory, and customer concentration?",
    "Did management update export-control, China, or supply-chain risk language?",
  ],
  software: [
    "How did ARR, RPO, net retention, and billings trend?",
    "Is growth coming from new logos, expansion, pricing, or AI packaging?",
    "Did operating leverage improve without weakening growth signals?",
  ],
  internet: [
    "How did advertising, engagement, monetization, and AI capex trend?",
    "Did management change language around competition or regulation?",
    "Are margin gains from durable operating leverage or temporary cost cuts?",
  ],
  automotive: [
    "How did deliveries, ASP, gross margin, and inventory trend?",
    "Did management update autonomy, energy, or production ramp expectations?",
    "Is price competition affecting demand quality?",
  ],
};

const SECTOR_QUESTIONS_ZH: Record<string, string[]> = {
  semiconductors: [
    "数据中心需求与 AI 加速器供应如何影响本季表现？",
    "毛利率、库存和客户集中度发生了什么变化？",
    "管理层是否更新了出口管制、中国市场或供应链风险的表述？",
  ],
  software: [
    "ARR、RPO、净收入留存率和账单额趋势如何？",
    "增长主要来自新客户、客户扩张、提价还是 AI 产品打包？",
    "经营杠杆是否改善，同时没有削弱增长信号？",
  ],
  internet: [
    "广告、用户参与度、变现效率和 AI 资本开支趋势如何？",
    "管理层是否调整了对竞争或监管的表述？",
    "利润率改善来自可持续经营杠杆，还是临时削减成本？",
  ],
  automotive: [
    "交付量、平均售价、毛利率和库存趋势如何？",
    "管理层是否更新了自动驾驶、能源业务或产能爬坡预期？",
    "价格竞争是否正在影响需求质量？",
  ],
};

export function generateKeyQuestions(input: {
  company?: CompanyProfile | null;
  news: NewsItem[];
  filings: FilingItem[];
  historical: HistoricalEarnings[];
}, lang: Lang = "en"): string[] {
  const sector = `${input.company?.sector ?? ""} ${input.company?.industry ?? ""}`.toLowerCase();
  const sectorQuestions = lang === "zh" ? SECTOR_QUESTIONS_ZH : SECTOR_QUESTIONS;
  const matched = Object.entries(sectorQuestions).find(([key]) => sector.includes(key))?.[1] ?? [];
  const context = contextQuestions(input.news, input.filings, lang);
  return [...matched, ...context, ...(lang === "zh" ? GENERIC_ZH : GENERIC)].slice(0, 7);
}

function contextQuestions(news: NewsItem[], filings: FilingItem[], lang: Lang) {
  const questions: string[] = [];
  if (news.length > 0) questions.push(lang === "zh" ? "哪条近期新闻在财报前改变了投资者预期？" : "Which recent news item changed investor expectations before the report?");
  if (filings.some((filing) => filing.formType === "8-K")) questions.push(lang === "zh" ? "最新 8-K 与财报核心结论相互印证还是存在矛盾？" : "Does the latest 8-K confirm or contradict the headline earnings narrative?");
  return questions;
}
