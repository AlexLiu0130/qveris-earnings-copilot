# 前端协作说明：QVeris Earnings Copilot

本文档给 Claude Code 前端实现使用。当前目录已经搭好后端/服务层骨架，前端只需要消费 API 和 `lib/earnings/types.ts` 里的类型。

## 1. 前端风格方向

整体视觉延续 option assistant 项目的高级金融工具感，但不要直接做成交易终端：

- 深色、高密度、专业研究台风格。
- 数字、状态、来源、confidence 要有强层级。
- 页面第一屏要可用，不做纯 marketing landing。
- 不使用轻飘飘的渐变营销页；重点是 source-aware research workflow。
- QVeris 独立品牌，核心语气是：可信、可审计、可复用的金融研究 Agent。

## 2. 已提供的后端结构

```text
app/api/earnings/analyze/route.ts
app/api/earnings/calendar/route.ts
app/api/earnings/share-card/route.ts
app/api/earnings/share-card/image/route.ts
app/api/earnings/analysis/[analysisId]/route.ts
app/api/earnings/history/[ticker]/route.ts

lib/earnings/
  types.ts
  analyzeEarnings.ts
  calendar.ts
  computeBeatMiss.ts
  computeHistoricalPattern.ts
  confidenceScoring.ts
  detectEarningsMode.ts
  generateKeyQuestions.ts
  generateResearchSummary.ts

lib/capabilities/
  EarningsCapabilityProvider.ts
  MockEarningsCapabilityProvider.ts
  QVerisCapabilityProvider.ts
  HybridEarningsCapabilityProvider.ts
  provider.ts
  mockData.ts

lib/share/shareCard.ts
```

## 3. API 使用方式

### 3.1 分析 ticker

`POST /api/earnings/analyze`

```json
{
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

前端重点使用字段：

- `analysisId`
- `analysis.summaryBullets`
- `analysis.keyQuestions`
- `analysis.keyDrivers`
- `analysis.riskSignals`
- `analysis.qualityOfEarnings`
- `analysis.watchNext`
- `analysis.confidence`
- `analysis.caveats`
- `data.company`
- `data.event`
- `data.upcomingEvent`
- `data.recentEvent`
- `data.estimates`
- `data.results`
- `data.quote`
- `data.historicalPattern`
- `data.historicalSummary`
- `data.news`
- `data.filings`
- `data.transcript`
- `data.beatMiss`
- `capabilityStatus`
- `missing`
- `conflicts`
- `sources`

### 3.2 财报日历

`GET /api/earnings/calendar?from=2026-07-08&to=2026-07-31&universe=popular`

可选参数：

- `from`
- `to`
- `universe`
- `sector`
- `status`
- `timing`
- `minMarketCap`

### 3.3 生成分享卡 payload

`POST /api/earnings/share-card`

```json
{
  "ticker": "NVDA",
  "format": "link"
}
```

返回：

- `shareUrl`
- `imageUrl`：指向 `GET /api/earnings/share-card/image`，当前返回 SVG，响应 `Cache-Control: no-store`。
- `markdown`
- `card`

### 3.4 读取已缓存 analysis

`GET /api/earnings/analysis/{analysisId}`

说明：

- `POST /api/earnings/analyze` 会返回 `analysisId`。
- `POST /api/earnings/share-card` 返回的 `shareUrl` 会带同一个 `analysisId`。
- 生产运行时通过 D1 读取/保存 stored analysis，缺少 D1 或读写失败会 fail closed；非生产才允许退到进程内存。
- 进程内存不持久、不跨实例共享，不能当作生产分享页存储。

## 4. 页面实现建议

### `/earnings`

首页是“财报研究控制台”，建议模块：

- 顶部产品名 + ticker search。
- Recently Reported。
- Upcoming Earnings。
- Featured Previews。
- Trending Briefs。
- Developer CTA，小型 workflow diagram。

注意：不要使用“今日财报”作为核心模块，因为并非每天都有强事件。

### `/earnings/calendar`

完整日历/表格页：

- Filter bar。
- List/table toggle。
- Event cards。
- 空状态要明确说明当前筛选范围内无事件。

### `/earnings/briefs`

内容流：

- Latest Flash Reports。
- Upcoming Previews。
- AI Stocks。
- Mega-cap Tech。
- Semiconductors。
- China ADRs。

### `/earnings/[ticker]`

核心研究页：

- Ticker header。
- Status banner。
- Capability status strip。
- Preview panel。
- Flash panel。
- Historical pattern。
- Market reaction。
- Business drivers / quality of earnings。
- Management & call intelligence。
- AI research summary。
- Sources & audit trail。
- Share / Export Markdown / API CTA。

如果 `data.transcript.available === false`，必须显示 transcript unavailable，不要隐藏整个 call intelligence 区域。

### `/earnings/[ticker]/share`

分享页要特别精致，适合作为传播入口：

- Share card first。
- 3-5 bullet summary。
- Confidence、source count、generatedAt。
- Powered by QVeris。
- 简短 sources。
- Analyze another ticker / Build with QVeris CTA。

### `/developers/earnings`

开发者页重点展示 QVeris 数据与工作流优势：

- Hero：Build source-cited earnings agents with QVeris.
- Animated workflow：setup -> print -> variance -> call read -> thesis impact -> quality check -> source audit -> output。
- Capability map。
- API examples。
- JSON schema preview。
- MCP/Codex usage example。
- Audit/confidence model。

## 5. Capability 状态展示规则

`capabilityStatus` 的值：

- `available`：真实可用。
- `partial`：部分可用。
- `unavailable`：不可用。
- `conflict`：来源冲突。
- `demo`：demo/mock 数据。

前端需要把 capability status 做成清晰的状态条。不要把 unavailable 当成错误页，它是产品诚实性的一部分。

## 6. 数据诚实规则

- 所有财务数字要么显示来源，要么显示 unavailable。
- 不要在 UI 上自己推导 buy/sell/hold。
- 不展示 QVeris price target。
- 不声称预测财报后股价。
- transcript 缺失时，不生成 management tone / Q&A pressure 结论。
- `sources.length`、`confidence.reason`、`missing` 应始终可见或可展开查看。

## 7. 当前数据模式

默认 `EARNINGS_PROVIDER=qveris`，直接通过 QVeris 拉真实数据。运行时代码只读 `process.env`；本地 `.env.local/.env` 是否生效取决于 Next/dev tooling，不会读取相邻项目的 `.env`。

生产 Sites 运行环境按交接已配置为 `EARNINGS_PROVIDER=qveris`、`EARNINGS_UNIVERSE=core`、`ALLOW_DEMO_DATA=false`。这只说明目标运行时配置，不能声称当前代码已经发布；线上仍旧版本未发布。

Mock provider 只保留给单测、本地离线开发和显式 demo 模式，不是默认产品数据源。支持的 demo ticker：

- NVDA
- TSLA
- MSFT
- AAPL
- META
- AMD
- PLTR
- AMZN

Mock 数据明确标记为 demo。前端可以先用这些 ticker 完整实现页面。

环境变量：

```text
EARNINGS_PROVIDER=qveris
EARNINGS_UNIVERSE=core
ALLOW_DEMO_DATA=false
QVERIS_API_KEY=
QVERIS_BASE_URL=https://qveris.ai/api/v1
DEEPSEEK_API_KEY=
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-flash
```

需要强制 mock 时：

```text
EARNINGS_PROVIDER=mock
ALLOW_DEMO_DATA=true
```

需要真实 QVeris + demo fallback 时：

```text
EARNINGS_PROVIDER=hybrid
ALLOW_DEMO_DATA=true
```

注意：生产环境不要静默混入 mock 数据。

## 8. 前端不要改的边界

- 不要绕过 `POST /api/earnings/analyze` 自己拼 analysis。
- 不要在组件里重新计算 beat/miss、confidence、mode。
- 不要把 mock data 直接 import 到页面组件里，除非做纯静态设计样稿。
- 不要把 transcript 当作必定存在。

## 9. 推荐组件拆分

```text
components/earnings/
  EarningsSearchBox.tsx
  EarningsCalendar.tsx
  EarningsEventCard.tsx
  TickerEarningsHeader.tsx
  EarningsStatusBanner.tsx
  CapabilityStatusStrip.tsx
  EarningsPreviewPanel.tsx
  EarningsFlashPanel.tsx
  HistoricalEarningsPattern.tsx
  MarketReactionPanel.tsx
  BusinessDriversPanel.tsx
  CallIntelligencePanel.tsx
  AiResearchSummary.tsx
  ConfidenceBadge.tsx
  SourceList.tsx
  ShareCard.tsx
  DeveloperCta.tsx

components/developer/
  WorkflowAnimation.tsx
  CapabilityMap.tsx
  ApiExample.tsx
  SchemaPreview.tsx
```

## 10. 验收协作点

前端完成后，至少用以下 ticker 检查：

- `NVDA`：完整 demo，transcript available。
- `TSLA`：transcript unavailable。
- `PLTR`：transcript unavailable。
- `MSFT`：软件/大型科技视角。

每个页面都要确认：

- confidence 可见。
- sources 可见或可展开。
- unavailable 状态不被静默隐藏。
- 没有 buy/sell/hold 建议。
