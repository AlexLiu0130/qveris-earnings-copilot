# QVeris Earnings Copilot 技术规格说明

版本：0.1  
日期：2026-07-08  
状态：草稿

## 1. 架构

在 `10_earnings_copilot` 中构建一个独立 Next.js 应用，不复用现有 TradeMind dashboard 作为产品壳。应用采用 provider-agnostic 的 earnings service layer，使同一套分析工作流可以运行在 mock data、真实 QVeris capabilities 或 hybrid 模式上。

```text
app/
  earnings/
    page.tsx
    calendar/page.tsx
    briefs/page.tsx
    [ticker]/page.tsx
    [ticker]/share/page.tsx
  developers/earnings/page.tsx
  workflows/earnings-research/page.tsx
  api/earnings/
    analyze/route.ts
    calendar/route.ts
    share-card/route.ts
    analysis/[analysisId]/route.ts

components/
  earnings/
  workflow/
  developer/
  shared/

lib/
  earnings/
  capabilities/
  share/
  formatting/
```

## 2. 推荐技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- Server routes 提供 API endpoints
- 默认使用 React Server Components；只有搜索、筛选、动画、分享操作等交互组件使用 Client Components
- 动画库可选 Motion / Framer Motion，由实现方结合项目依赖选择

## 3. 数据模型

代码字段保持英文，便于 API 和工程实现；业务解释使用中文。

```ts
export type ConfidenceLabel = "high" | "medium" | "low";
export type EarningsTiming = "before_open" | "after_close" | "during_market" | "unknown";
export type BeatMiss = "beat" | "miss" | "inline" | "unavailable";
export type CapabilityState = "available" | "partial" | "unavailable" | "conflict" | "demo";

export interface SourceRef {
  id: string;
  title: string;
  provider?: string;
  url?: string;
  publishedAt?: string;
  retrievedAt: string;
  capability?: string;
  executionId?: string;
}

export interface CompanyProfile {
  ticker: string;
  name: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  marketCap?: number;
  currency?: string;
  sourceIds: string[];
}

export interface EarningsEvent {
  id: string;
  ticker: string;
  fiscalPeriod?: string;
  fiscalYear?: number;
  reportDate: string;
  timing: EarningsTiming;
  status: "upcoming" | "reported" | "unknown";
  sourceIds: string[];
}

export interface EarningsEstimates {
  ticker: string;
  eventId?: string;
  revenueEstimate?: number;
  epsEstimate?: number;
  revenueGrowthEstimateYoY?: number;
  epsGrowthEstimateYoY?: number;
  estimateCount?: number;
  sourceIds: string[];
}

export interface EarningsResults {
  ticker: string;
  eventId?: string;
  revenueActual?: number;
  epsActual?: number;
  grossMargin?: number;
  operatingMargin?: number;
  netIncome?: number;
  guidanceText?: string;
  segmentHighlights?: string[];
  sourceIds: string[];
}

export interface HistoricalEarnings {
  eventId: string;
  fiscalPeriod?: string;
  reportDate: string;
  revenueActual?: number;
  revenueEstimate?: number;
  epsActual?: number;
  epsEstimate?: number;
  oneDayMovePct?: number;
  fiveDayMovePct?: number;
  sourceIds: string[];
}

export interface StockQuote {
  ticker: string;
  price?: number;
  changePct?: number;
  afterHoursChangePct?: number;
  preMarketChangePct?: number;
  volume?: number;
  avgVolume30d?: number;
  timestamp: string;
  sourceIds: string[];
}

export interface NewsItem {
  id: string;
  title: string;
  summary?: string;
  url?: string;
  publishedAt?: string;
  provider?: string;
  sourceIds: string[];
}

export interface FilingItem {
  id: string;
  formType: "10-K" | "10-Q" | "8-K" | "DEF 14A" | "other";
  filedAt: string;
  title?: string;
  url?: string;
  summary?: string;
  sourceIds: string[];
}

export interface TranscriptInsight {
  available: boolean;
  managementTone?: "more_positive" | "neutral" | "more_negative" | "unavailable";
  guidanceTone?: "more_positive" | "neutral" | "more_negative" | "unavailable";
  riskLanguage?: "increased" | "unchanged" | "decreased" | "unavailable";
  repeatedQuestions?: string[];
  keyQuotes?: Array<{ text: string; speaker?: string; sourceIds: string[] }>;
  sourceIds: string[];
}

export interface EarningsAnalysis {
  ticker: string;
  mode: "preview" | "flash" | "call_intelligence" | "combined" | "no_event";
  company?: CompanyProfile | null;
  event?: EarningsEvent | null;
  upcomingEvent?: EarningsEvent | null;
  recentEvent?: EarningsEvent | null;
  estimates?: EarningsEstimates | null;
  results?: EarningsResults | null;
  quote?: StockQuote | null;
  historicalPattern: HistoricalEarnings[];
  news: NewsItem[];
  filings: FilingItem[];
  transcript?: TranscriptInsight | null;
  beatMiss?: {
    revenue: BeatMiss;
    eps: BeatMiss;
    guidance: "raised" | "lowered" | "maintained" | "unavailable";
  };
  keyQuestions: string[];
  keyDrivers: string[];
  riskSignals: string[];
  qualityOfEarnings: string[];
  summaryBullets: string[];
  watchNext: string[];
  confidence: {
    label: ConfidenceLabel;
    reason: string;
  };
  caveats: string[];
  capabilityStatus: Record<string, CapabilityState>;
  missing: string[];
  conflicts: string[];
  sources: SourceRef[];
  generatedAt: string;
  demo?: boolean;
}
```

## 4. Capability Provider 接口

```ts
export interface EarningsCapabilityProvider {
  getCompanyProfile(ticker: string): Promise<CompanyProfile | null>;
  getEarningsCalendar(params: EarningsCalendarParams): Promise<EarningsEvent[]>;
  getEarningsEstimates(ticker: string, eventId?: string): Promise<EarningsEstimates | null>;
  getEarningsResults(ticker: string, eventId?: string): Promise<EarningsResults | null>;
  getHistoricalEarnings(ticker: string, limit?: number): Promise<HistoricalEarnings[]>;
  getStockQuote(ticker: string): Promise<StockQuote | null>;
  getHistoricalPrices(ticker: string, params: HistoricalPriceParams): Promise<PriceBar[]>;
  getFinancialNews(ticker: string, params: NewsParams): Promise<NewsItem[]>;
  getSecFilings(ticker: string, params: FilingParams): Promise<FilingItem[]>;
  getEarningsTranscript?(ticker: string, eventId?: string): Promise<TranscriptInsight | null>;
  getAnalystRevisions?(ticker: string, params: AnalystParams): Promise<AnalystRevision[]>;
}
```

需要实现：

- `MockEarningsCapabilityProvider`
- `QVerisCapabilityProvider`
- `HybridEarningsCapabilityProvider`

Hybrid provider 在生产模式下优先使用 QVeris capability。只有显式 demo 模式允许 fallback 到 mock。生产环境不能静默混入 mock 数据。

## 5. 分析模块

### `detectEarningsMode`

规则：

- 找未来 45 天内最近的 upcoming event。
- 找过去 14 天内最近的 reported event。
- 如果有 recent reported event，优先显示 flash。
- 如果 upcoming 和 recent 同时存在，mode 为 `combined`。
- 如果都不存在，mode 为 `no_event`。

### `computeBeatMiss`

Revenue：

```ts
if (actual == null || estimate == null) return "unavailable";
if (actual > estimate * 1.002) return "beat";
if (actual < estimate * 0.998) return "miss";
return "inline";
```

EPS：

```ts
if (actual == null || estimate == null) return "unavailable";
if (actual > estimate) return "beat";
if (actual < estimate) return "miss";
return "inline";
```

### `computeHistoricalPattern`

返回：

- revenue beat count
- EPS beat count
- average one-day move
- average five-day move
- largest positive move
- largest negative move
- 少于 4 个历史事件时返回 limited-history flag

### `generateKeyQuestions`

输入：

- sector
- company profile
- news
- filings
- historical results
- transcript / analyst revisions（可用时）

兜底问题：

- Revenue growth 是加速还是减速？
- Margins 是改善还是恶化？
- Management 是上调、下调还是维持 guidance？
- 哪个业务 segment 驱动了结果？
- Management 强调了哪些风险？

### `scoreConfidence`

High：

- 相关场景下 actual / estimate 数据可用。
- 至少 3 个可靠来源。
- 没有主要数据冲突。
- 已报告财报有 filing 或 company release。

Medium：

- 主结果/预期数据可用，但 guidance、transcript 或 analyst context 不完整。

Low：

- actuals 或 estimates 缺失。
- 来源数值冲突。
- 只有新闻摘要可用。

## 6. API Endpoints

### `POST /api/earnings/analyze`

Request：

```json
{
  "analysisId": "NVDA-combined-20260708T000000Z",
  "ticker": "NVDA",
  "mode": "auto",
  "language": "en",
  "includeSources": true,
  "includeHistoricalPattern": true,
  "includeNews": true,
  "includeFilings": true,
  "includeTranscript": true,
  "maxNewsItems": 5
}
```

Response：

```json
{
  "ticker": "NVDA",
  "mode": "combined",
  "generatedAt": "2026-07-08T00:00:00.000Z",
  "analysis": {
    "summaryBullets": [],
    "keyQuestions": [],
    "keyDrivers": [],
    "riskSignals": [],
    "watchNext": [],
    "confidence": {
      "label": "medium",
      "reason": "Results, estimates, filings and news are available; transcript is unavailable."
    },
    "caveats": []
  },
  "data": {
    "company": {},
    "event": {},
    "estimates": {},
    "results": {},
    "quote": {},
    "historicalPattern": [],
    "news": [],
    "filings": [],
    "transcript": null
  },
  "capabilityStatus": {
    "earningsCalendar": "available",
    "estimates": "available",
    "results": "available",
    "quote": "available",
    "news": "available",
    "filings": "available",
    "transcript": "unavailable"
  },
  "missing": ["transcript"],
  "conflicts": [],
  "sources": []
}
```

### `GET /api/earnings/analysis/{analysisId}`

用于分享页和前端复用已生成 analysis。当前 MVP 使用服务端内存缓存，TTL 为 30 分钟。生产持久分享页需要迁移到数据库或 KV。

### `GET /api/earnings/calendar`

Query：

- `from`
- `to`
- `universe`
- `sector`
- `status`
- `timing`
- `minMarketCap`

Response：

```json
{
  "from": "2026-07-08",
  "to": "2026-07-15",
  "events": [],
  "sources": [],
  "missing": []
}
```

### `POST /api/earnings/share-card`

Request：

```json
{
  "ticker": "NVDA",
  "analysisId": "analysis_123",
  "format": "link"
}
```

Response：

```json
{
  "shareUrl": "/earnings/NVDA/share?analysisId=analysis_123",
  "imageUrl": null,
  "markdown": "...",
  "card": {
    "ticker": "NVDA",
    "eventType": "Flash",
    "bullets": [],
    "sourceCount": 5,
    "confidence": "medium",
    "poweredBy": "QVeris"
  }
}
```

## 7. 页面要求

### `/earnings`

模块：

- 高级感 header，包含产品名和 ticker search。
- 最近已发布财报。
- 即将发布财报。
- 重点财报前瞻。
- 热门 briefs。
- 带小型 workflow diagram 的 developer CTA。

### `/earnings/calendar`

模块：

- Filter bar。
- Calendar / table toggle。
- Event cards 或 rows。
- 选中范围内无事件时的 empty state。

### `/earnings/briefs`

模块：

- 最新 flash reports。
- 即将发布 previews。
- Category filters。
- 带 confidence/source count 的 brief cards。

### `/earnings/[ticker]`

模块：

- Ticker header。
- Status banner。
- Capability status strip。
- Earnings preview panel。
- Earnings flash panel。
- Historical pattern panel。
- Market reaction panel。
- Business drivers / quality-of-earnings panel。
- Management and call intelligence panel。
- AI research summary。
- Watch-next checklist。
- Sources and audit trail。
- Export/share/API CTAs。

### `/earnings/[ticker]/share`

模块：

- Share card first。
- 简版 brief。
- Source summary。
- Analyze another ticker CTA。
- Build with QVeris CTA。

### `/developers/earnings`

模块：

- Hero: "Build source-cited earnings agents with QVeris."
- 动画工作流：setup、print、variance、call read、thesis impact、quality check、source audit、output。
- Capability map。
- API example。
- JSON schema preview。
- MCP/Codex usage example。
- Audit/confidence explanation。
- QVeris signup/docs CTA。

### `/workflows/earnings-research`

模块：

- 完整 workflow animation。
- Step-by-step pipeline。
- Data categories 和 fallback behavior。
- Example execution trace。

## 8. 分享卡要求

Card variants：

- Preview
- Flash
- Call Intelligence
- Combined

必需字段：

- ticker
- company
- event type
- 3-5 bullets
- confidence
- source count
- generated timestamp
- Powered by QVeris
- research-only disclaimer

## 9. Mock Data

创建 demo 数据：

- NVDA
- TSLA
- MSFT
- AAPL
- META
- AMD
- PLTR
- AMZN

每个 ticker 包含：

- company profile
- upcoming event
- recent event
- estimates
- actuals
- historical earnings
- quote
- news
- filings
- transcript state，至少部分 ticker 为 unavailable
- sources

Mock 数据必须设置 `demo: true`，source title 必须明确包含 "Demo source"。

## 10. 错误处理

| 场景 | 行为 |
|---|---|
| Invalid ticker | 显示 “We could not find this ticker. Please check the symbol and try again.” |
| No near-term event | 展示历史财报和近期 context，不显示空白页 |
| Missing estimates | 标记 estimates unavailable，限制 beat/miss 分析 |
| Missing actuals | 显示 partial flash state |
| Missing transcript | 不生成 transcript-derived claims，显示 transcript unavailable |
| Source conflicts | 展示 conflict list，confidence 设为 low |
| Provider failure | 返回 partial data，并标记 missing capability status |

## 11. 合规与安全

- 每个 analysis 页面都展示 research-only disclaimer。
- 不提供 buy/sell/hold 建议。
- 不生成 QVeris price target。
- 不声称预测财报后股价。
- 不编造缺失财务数字。
- transcript quote 必须短，不复制长段版权内容。
- 清楚区分 facts、interpretation 和 unavailable data。

## 12. 实现阶段

### Phase 1：产品壳与 Mock 工作流

- 独立 Next.js app。
- Types、mock provider、analysis service。
- 使用 demo data 的核心页面。
- Analyze/calendar/share-card API routes。

### Phase 2：QVeris Capability 集成

- QVeris provider wrapper。
- Capability status 和 source metadata。
- 能接的真实 calendar、quotes、filings/news/results。
- Provider schema normalization。

### Phase 3：Transcript 与 Call Intelligence

- 可用时接入 transcript retrieval。
- Management tone 和 Q&A analysis。
- Previous-call comparison。

### Phase 4：Share 与 Developer 质感打磨

- Share image generation。
- Developer workflow animation。
- API docs polish。
- Analytics instrumentation。

## 13. 环境变量

```text
QVERIS_API_KEY=
QVERIS_BASE_URL=https://qveris.ai/api/v1
OPENAI_API_KEY=
OPENAI_MODEL=
EARNINGS_PROVIDER=qveris|hybrid|mock
ALLOW_DEMO_DATA=false
```

默认值为 `qveris`。Mock 只用于测试/离线开发，生产不应默认启用。

## 14. 验收标准

- 用户可以搜索支持的 ticker，并看到完整 source-aware analysis 页面。
- API 可以对支持的 mock ticker 返回结构化 `EarningsAnalysis`。
- transcript 缺失不会导致分析失败。
- 分享页可以从 analysis payload 渲染。
- Developer page 能解释 QVeris workflow，并包含可用 API 示例。
- UI 中所有数字要么有 source，要么明确 unavailable。
- 生成文本中不出现 buy/sell/hold 建议。
