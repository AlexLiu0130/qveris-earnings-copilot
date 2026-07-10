# QVeris Earnings Copilot PRD

版本：0.1  
日期：2026-07-08  
负责人：Product  
状态：设计与工程对齐草稿

## 1. 执行摘要

我们要构建一个独立的 QVeris Earnings Copilot：面向美股投资者、财经创作者和开发者团队的、带来源引用的财报研究产品。它不是普通 AI 财报总结工具，而是把财报日历、市场预期、实际业绩、行情、公告、新闻、SEC filings、电话会 transcript（可用时）组织成一套可复用的财报研究工作流，并输出为财报前瞻、财报快报、电话会洞察、分享页、Markdown 和 API JSON。

产品目标是证明：QVeris 不只是数据接口或聊天机器人底座，而是可以驱动可靠、可验证、可审计的金融研究 Agent 工作流。

🔶 **假设：** 首批用户会重视“研究流程清晰”和“来源可审计”，而不只是 ticker 覆盖数量。需要通过创作者和开发者访谈验证。

## 2. 问题定义

### 谁有这个问题？

- 关注美股财报季的活跃个人投资者。
- 需要快速覆盖多个 ticker 的财经创作者、Newsletter 作者、小红书/中文社区内容创作者。
- 希望通过 API/MCP/Agent 集成结构化财报智能的 fintech 和 AI agent 开发者。

### 问题是什么？

财报分析信息分散在 earnings release、分析师预期、SEC filings、新闻、行情、电话会 transcript 等多个来源里。用户经常只能看到 revenue / EPS beat miss 这种头条信息，却缺少更重要的研究上下文：市场原本预期什么、guidance 有没有变化、业务 segment 谁在驱动、管理层语气有什么变化、分析师电话会上反复追问什么、股价反应是否已经被预期定价。

### 为什么痛？

- **投资者痛点：** 收集信息耗时，容易把 headline beat/miss 当成完整结论，忽略 guidance、margin、management tone、positioning 等变量。
- **创作者痛点：** 财报季需要高频产出可信、可分享内容，手工整理多个 ticker 不可扩展。
- **开发者痛点：** 构建财报 Agent 需要接入多个数据商、处理不同 schema、保留来源信息和异常状态，开发成本高。
- **QVeris 商业痛点：** 需要一个公开 proof point 展示 capability routing、source metadata、audit trail 和 agent workflow 的价值。

### 证据与依据

- 专业财报分析不止看 revenue / EPS，还会看 guidance、margin trajectory、segment drivers、management tone、Q&A pressure、多季度趋势和 market reaction context。
- QVeris 的产品定位适合展示“统一能力层 + 多数据源编排 + 可审计输出”的优势。
- 🔵 **开放问题：** QVeris 生产环境里 estimates、actuals、transcripts、analyst revisions、segment KPI 等能力的具体 capability ID、schema 和权限范围仍需确认。

## 3. 目标用户与 Persona

### Persona A：活跃个人投资者

- **角色：** 跟踪美股财报和重点持仓/观察名单的个人投资者。
- **目标：** 快速理解即将发布或刚发布的财报。
- **痛点：** 数据分散，事实和解释混在一起，不知道下一步该关注什么。
- **当前行为：** 看新闻标题、扫 earnings release、看股价反应、问 AI 做摘要。
- **JTBD：** 当一家公司发布财报时，帮我快速知道发生了什么、为什么重要、接下来要跟踪什么，但不要给买卖建议。

### Persona B：财经创作者

- **角色：** Newsletter、X/LinkedIn、小红书、中文财经社区作者。
- **目标：** 快速生成可信的财报前瞻、财报快报、分享卡片和 thread。
- **痛点：** 财报季覆盖多个 ticker，人工整理效率低，分享格式还要二次加工。
- **当前行为：** 查 earnings calendar，把数据复制进笔记，手写摘要和观点。
- **JTBD：** 财报季高峰时，帮我批量生成带来源的 brief 和可传播素材。

### Persona C：Fintech / Agent 开发者

- **角色：** 金融应用、研究 dashboard、AI agent、Newsletter 工具开发者。
- **目标：** 通过 API/MCP/SDK 调用结构化财报分析工作流。
- **痛点：** 数据源接入复杂，schema 不统一，缺少 source metadata 和 confidence。
- **当前行为：** 自己拼多个 vendor API 和 prompt。
- **JTBD：** 当我需要把财报智能嵌进产品时，给我一个带结构化数据、来源、缺失字段、置信度和降级逻辑的工作流。

## 4. 战略背景

### 为什么现在做？

- 财报季高频、周期性强、天然适合分享传播。
- AI agent 产品需要可发现、可检查、可审计的金融工作流。
- 财报分析天然需要多类数据：事件、预期、实际业绩、行情、filings、新闻、transcripts 和语言分析，非常适合展示 QVeris 的能力编排。

### 差异化

QVeris Earnings Copilot 不应该被做成“又一个 AI 总结页”。差异化应来自：

- **Workflow-first research：** 固定研究流程，而不是自由聊天。
- **Capability routing：** 通过 QVeris 发现、检查、调用合适的金融能力。
- **Source auditability：** 每个关键数字和结论都绑定来源，缺失就明确 unavailable。
- **Degradable intelligence：** transcript、analyst revision、segment KPI 是增强能力；没有时降级，不编造。
- **Reusable outputs：** 同一份 analysis payload 支撑 UI、分享页、Markdown、API JSON、Agent prompt。

### 定位

> QVeris Earnings Copilot 不是财报总结工具，而是一个把财报事件拆成可验证研究流程的 Agent 产品。

英文对外表达：

> QVeris Earnings Copilot reconstructs the research workflow behind an earnings event, with sources, confidence, and reusable agent/API outputs.

## 5. 方案概览

### 产品界面

1. **财报研究首页** `/earnings`  
   类似高端金融研究台，包含 ticker 搜索、最近财报、即将发布、重点前瞻、热门 brief、开发者 CTA。

2. **财报日历** `/earnings/calendar`  
   完整日历，支持日期、市值、行业、报告时段、状态、热门分组筛选。

3. **Brief 内容流** `/earnings/briefs`  
   展示最新 flash reports、upcoming previews、AI stocks、mega-cap tech、semiconductors、high volatility names、China ADRs 等内容流。

4. **Ticker 研究页** `/earnings/[ticker]`  
   核心研究报告页，包含 preview、flash、历史规律、市场反应、关键指标、新闻/filing context、AI summary、caveats、sources/audit trail。

5. **分享页** `/earnings/[ticker]/share`  
   公开传播页，展示精致 share card、简版 full brief、sources、转化 CTA。

6. **开发者页** `/developers/earnings`  
   讲清 QVeris 工作流、capability graph、API 示例、JSON schema、MCP/Codex 示例、source/audit model。

7. **工作流展示页** `/workflows/earnings-research`  
   可选页面，用动画/图形展示 earnings research pipeline 和 QVeris capability orchestration。

### 核心研究工作流

1. **Pre-print Setup / 财报前准备**  
   确认事件、共识预期、历史 beat/miss、市场环境、隐含预期与财报前关键争议，判断 preview、flash、combined、call intelligence 或 no event。

2. **Print Ingestion / 业绩拉取**  
   获取实际值、guidance、segment/KPI、margin、cash flow、新闻、SEC filings 与 transcript（可用时）。

3. **Variance Table / 差异表**  
   对比 actuals vs consensus、prior quarter、prior estimate、company guidance，明确 surprise magnitude。

4. **Call Read / 电话会阅读**  
   transcript 可用时，提取 tone、guidance language、分析师追问、管理层回避问题与相较上次电话会的变化。

5. **Thesis Impact / 投资逻辑影响**  
   判断增长、margin、FCF、capex、分部和关键业务假设哪些需要更新。

6. **Quality Check / 质量检查**  
   标记一次性项目、应计与现金流背离、库存、backlog、客户集中、监管/供应链风险与风险措辞。

7. **Source Audit & Confidence / 来源审计与置信度**  
   绑定 source refs、timestamps、capability names、missing fields、conflicts、confidence reason。

8. **Output Generation / 输出生成**  
   生成 preview、flash、call intelligence、页面模块、share card、Markdown、API JSON、Agent prompt template。

### 除财务比率外必须覆盖的研究角度

- 市场预期 vs 实际结果，包括 surprise magnitude。
- Guidance vs consensus / prior guidance。
- 不同行业的 segment/KPI drivers。
- Margin trajectory 和 operating leverage。
- Quality of earnings：一次性项目、buyback、税率、成本削减、会计处理。
- Management tone 和语言变化。
- Analyst Q&A pressure，以及管理层回避的问题。
- Market reaction context：positioning、估值、行业联动、预期差。
- Risk signals 和 watch-next checklist。

## 6. 成功指标

### 产品使用

- Search-to-analysis completion rate。
- Ticker 研究页访问量。
- 分享页生成次数。
- 分享页访问量与回流分析转化。
- Markdown/API copy actions。

### 研究质量

- 至少 3 个来源的 analysis payload 占比。
- 带 source ID 的数值型 claim 占比。
- missing/capability status 是否正确展示。
- 用户对 brief 有用性的评分。

### 开发者采用

- Developer page visits。
- API key signup 或 QVeris CTA 点击。
- API example copy events。
- 每账号 workflow/API requests。

🔵 **开放问题：** 具体流量、转化、QVeris signup 目标需要业务侧确认后补充。

## 7. 需求

### 功能需求

#### 财报研究首页

- 用户可以输入 ticker 并跳转到 ticker 研究页。
- 页面展示最近财报、即将发布、重点前瞻、热门 brief、开发者 CTA。
- 如果当天没有财报，不应暗示“今日财报”存在。

#### 财报日历

- 支持日期范围、行业、市值区间、报告时段、状态、热门分组筛选。
- 支持列表/表格视图。
- 每个事件链接到 ticker 页，并尽可能标注 Preview 或 Flash。

#### Ticker 研究页

- 展示公司 header、ticker、exchange、sector、最新价格、事件状态、confidence badge、免责声明。
- 支持 Preview、Flash、Combined、No Event、Partial Data 状态。
- 每个财务数字必须有 source ID，或明确标记 unavailable。
- transcript 派生模块在 transcript 缺失时必须显示 unavailable/pending。

#### 分享页

- 用户可以从 analysis 生成公开分享页。
- 分享页展示精致 card、3-5 条 bullet、confidence、source count、“Powered by QVeris”。
- 分享格式包括 link、Markdown；图片生成可作为增强能力。

#### 开发者页

- 解释 QVeris 数据/能力层优势。
- 展示 workflow 动画或图示。
- 包含 cURL、JSON response、TypeScript 示例、MCP/Codex 用法、prompt template。
- 明确 QVeris 不提供投资建议。

#### API

- `POST /api/earnings/analyze`
- `GET /api/earnings/calendar`
- `POST /api/earnings/share-card`
- 响应必须包含 `sources`、`missing`、`capabilityStatus`、`confidence`、`generatedAt` 和结构化数据。

### 非功能需求

- 不提供 buy/sell/hold 建议。
- 不生成 QVeris 自有 price target。
- 不编造财务数字。
- estimates、actuals、transcript、filings、quote 缺失时必须优雅降级。
- source metadata 必须贯穿 UI、分享页、API。
- mock provider 必须明确标记 demo data。
- UI 应该有高端金融研究产品质感，可参考期权助手项目的高级感，但需要重塑为 QVeris 独立品牌。

## 8. 不做什么

- 自动交易。
- 组合配置建议。
- 预测财报后股价走势。
- 完整 Bloomberg/Koyfin 替代品。
- 复杂期权策略推荐。
- 保证每个 ticker/event 都有电话会 transcript。
- 在数据源不支持时宣称实时数据。

## 9. 依赖与风险

### 依赖

- QVeris API key 与 capability execution 权限。
- earnings calendar、estimates、results、transcripts、filings、news、quotes、analyst context 的具体 capability ID 和 schema。
- LLM provider 用于生成研究摘要。
- 分享卡图片生成或服务端渲染方案。

### 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| Transcript 覆盖不完整 | Call intelligence 可能缺失 | transcript 作为增强能力，显示 unavailable 并降低 confidence |
| Provider schema 不一致 | 工程复杂度上升 | 通过 `EarningsCapabilityProvider` 统一归一化 |
| AI 摘要幻觉 | 损害信任 | 只基于结构化 payload 生成，missing 字段显式展示 |
| 来源冲突 | 用户困惑 | 显示 conflict list，confidence 设为 low |
| 页面信息过密 | 用户阅读困难 | 采用 summary-first、模块层级、可折叠详情 |
| 分享页过度承诺 | 合规/声誉风险 | 显示 confidence、source count 和 research-only disclaimer |

## 10. 开放问题

- QVeris 每个数据类别的 production-ready capability 是哪些？
- Launch coverage 应覆盖哪些 ticker/provider？
- 分享页生成是否需要登录，还是允许匿名公开生成？
- QVeris 官网品牌与这个独立产品的品牌边界如何处理？
- 分享图片是否首发实现，还是先做 link/Markdown？
- 生产摘要使用哪个 LLM model，成本和速率限制如何设置？
- analysis 缓存、source retention、share page 生命周期策略如何定？

## 11. 参考资料

- QVeris financial data MCP server: https://qveris.ai/guides/financial-data-mcp-server
- QVeris earnings APIs guide: https://qveris.ai/guides/best-earnings-apis-for-ai-agents/
- QVeris earnings call signal demo: https://qveris.ai/blog/qveris-wechat-2247484902
- QVeris financial research agents: https://qveris.ai/guides/ai-agents-for-financial-research/
- TIKR earnings transcript analysis: https://www.tikr.com/blog/how-to-read-earnings-call-transcripts-like-a-buy-side-analyst-and-most-important-things-to-look-for
- LlamaIndex earnings transcript analysis: https://www.llamaindex.ai/glossary/earnings-call-transcript-analysis
- Investopedia earnings call explainer: https://www.investopedia.com/terms/e/earnings-call.asp
- CFA Institute on earnings call tone: https://rpc.cfainstitute.org/blogs/enterprising-investor/2018/managers-or-analysts-whose-tone-matters-more-on-earnings-calls
