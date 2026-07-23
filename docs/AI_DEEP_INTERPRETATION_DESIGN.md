# AI Deep Interpretation 设计

状态：`earnings_research_agent_v1` 已实现，本地 DeepSeek 与 MU 真实快照回归已通过；尚未部署生产
范围：在既有 Earnings Copilot 的 `analyzeEarnings()`、`aiSummary.ts`、`research_snapshots` 和 D1 血缘之上增加深度解读；不新建第二套研究、来源或持久化系统。

## 0. 当前 Agent 运行设计

Agent 不是可自由上网或自行调用数据工具的多步自治体，而是运行在一份冻结财报快照上的受约束研究流程。它由四个可观测阶段组成：

1. `evidence`：冻结当前 `analysisId`，建立字段、来源和可用数值索引；来源不足时不调用模型。
2. `route`：用确定性规则在 `company_only`、`demand_initiator`、`upstream_supplier` 等角色中路由。产业角色必须有可引用的产品证据与需求/投入证据。
3. `research`：仅进行一次 DeepSeek JSON 调用；模型只解释经营机制、反证和后续验证，不负责数字计算，也不能新增公司或来源。
4. `audit`：逐条校验来源 ID、数字、ticker、角色、节点方向与禁用建议；不合格条目删除，核心结论可由确定性 beat/miss 基线替代。

同一基础快照与 `earnings_research_agent_v1` 合同只生成一次；后续请求复用不可变研究快照。模型不可用时，基础财报仍可展示，并降级为带来源的确定性公司解读。

### MU 首条验收样本

- 无产品—需求关系来源时必须路由为 `company_only`，不得凭模型常识补 HBM 客户、GPU 公司或“受益标的”。
- 当前快照同时出现 DRAM/NAND 产品来源和 AI/客户需求来源时，可路由为 `upstream_supplier`。
- 传导节点固定为 `AI 与数据中心需求 → 存储需求与产品组合 → Micron → 收入与利润率验证`；每一边都必须引用当前快照来源，并以条件性语言和低/中置信度呈现。
- 所有数字由确定性层生成；模型自行换算、计算或缩放的数字一律剔除。

## 1. 决策与目标

### 决策

在 `/earnings/[ticker]` 的既有研究页内增加“深度解读”标签组，而非新增独立页面。一次 DeepSeek 调用只可把已经存在、可审计的结构化证据组织成三种读法；它不能发现新事实、补全来源、替代确定性摘要或产生投资建议。

### 目标

- 让研究者从单公司财报快速回答三件不同的问题：该公司本身发生了什么、可能向产业链传导什么、下一步应验证什么。
- 每个结论都可区分为事实、推断或待验证，并带 `sourceIds`、置信度、反证条件和时间时滞。
- 复用当前 `EarningsAnalysis` 的 `sources`、`missing`、`conflicts`、`capabilityStatus`、`claimSourceIds` 与 `analysisId`，保持现有数据诚实边界。
- 复用 `research_snapshots` 持久化深度结果；生产仍由 D1 fail-closed 保证研究快照可复现。

### 非目标

- 不做股票推荐、目标价、交易信号、产业链收益排序或“受益标的清单”。
- 不从模型知识、新闻标题或未经接入的公司关系中补造供应商、客户、订单、Capex 数字或下一次财报日期。
- 不把相关性表述成因果，不把公司管理层计划表述成已发生的产业收入。
- 不创建新的向量库、图数据库、关系知识库、第二个模型服务、第二个 D1 数据库或单独的缓存层。
- 不改变既有基础研究页在模型不可用时的可用性。

## 2. 现有系统约束与接入点

`analyzeEarnings()` 已并行取公司、财报日历、结果/预期、报价、价格、财务报表、分部、新闻、文件、电话会与分析师修订；之后先生成确定性 `generateResearchSummary()`，建立 `claimSourceIds`，最后才调用 `generateAiSummary()`。现有 AI 合并器只接受与确定性文案完全一致、且引用是既有有效来源子集的条目。深度解读应继承这个“确定性优先、AI 只能受约束改写”的顺序，不能反向覆盖基础字段。

`aiSummary.ts` 当前通过 DeepSeek 兼容的 `chat/completions` JSON object 模式调用，20 秒超时，失败返回 `null`。深度解读使用同一运行时配置和同一服务调用方式，但使用独立、版本化的 JSON 合同；文档中不记录任何密钥或其值。

`analysisStore.ts` 已将完整 `EarningsAnalysis` JSON 写入 `research_snapshots`，请求可复用缓存为 30 分钟；`source_refs`、`event_facts`、`earnings_events` 是长期研究资产，并能回连 `qveris_fetch_cache` 的原始执行。生产缺失 D1 或快照读写失败必须 fail-closed；非生产才可使用内存回退。深度字段应放入同一 `EarningsAnalysis` 快照 JSON，并只引用已有 `source_refs`，不新建表。

## 3. 页面位置与三个视图

### 位置与加载方式

- 位置：`/earnings/[ticker]?analysisId=...` 的主内容区，放在现有 `KeyMetricsPanel` 之后、`MultiQuarterPanel` 之前；右侧现有证据面板和 `SourceList` 继续作为所有视图的共用审计入口。
- 标签：`公司解读`、`产业传导`、`后续验证`。默认进入 `公司解读`，标签状态留在组件内部；只有通过确定性产业门槛且至少一条传导边通过校验时才显示“产业传导”。
- 快照：带 `analysisId` 时只展示该快照的深度结果；不以最新数据偷偷替换历史判断。没有深度结果时显示“基于当前快照生成”，生成后切换到返回的新 `analysisId`。
- 加载：基础财报研究以 `includeAiInterpretation: false` 先返回；客户端面板随后把该快照的 `analysisId` 交给 `/api/earnings/interpretation`。后端只读取这份已保存快照生成解读，不重复拉取 QVeris；结果连同同版本 `sources` 保存为新的不可变快照。显式历史 `analysisId` 不自动重新生成，避免用新模型结果覆盖历史判断。

### 视图合同

| 视图 | 用户问题 | 展示内容 | 不可输出 |
| --- | --- | --- | --- |
| 公司解读 | 这家公司相对本次财报发生了什么？ | 事实基线、业绩/指引/质量变化、经证据支持的经营解释、反证与不确定性 | 超出当前公司与事件证据的产业链结论 |
| 产业传导 | 若公司是产业节点，变化可能影响谁、何时、通过什么机制？ | 公司角色、带方向和时滞的传导链、每一段的事实锚点、推断、反证与验证项 | 未证实的客户/供应商关系，或“受益/受损标的”式结论 |
| 后续验证 | 什么可证伪当前解释，何时检查？ | 待验证命题、下一证据、预计窗口、通过/不通过条件、失效原因 | 模型臆测的日期、确定性预测、无限观察清单 |

每张结论卡固定显示：`事实 / 推断 / 待验证` 徽标、来源引用、置信度、反证和时滞。事实卡可用实心样式；推断卡与待验证卡必须视觉弱化，并显示“非事实”。

## 4. 公司角色路由

### 角色枚举

角色仅用于选择应显示的解读模板，不是投资标签。一个公司可以有主角色和次角色；若证据不够，必须是 `company_only`。

| role | 适用证据 | 路由重点 |
| --- | --- | --- |
| `demand_initiator` | 公司文件/电话会明确披露需求、采购、Capex、部署或扩产计划 | 投资/采购 → 建设/部署 → 运营指标；要求时滞 |
| `upstream_supplier` | 已有来源明确该公司提供组件、设备、软件或服务 | 客户需求 → 订单/出货 → 收入/利润率；不凭行业常识补客户 |
| `infrastructure_enabler` | 已有来源明确公司提供云、网络、电力、数据中心或平台能力 | 负载/使用率 → 容量 → Capex/定价/利用率 |
| `downstream_monetizer` | 已有来源明确公司将上游能力转为广告、订阅、交易或终端服务 | 成本/能力 → 用户或价格 → 变现/KPI |
| `peer_or_competitor` | 公司文件、事件或已接入来源给出可比竞争维度 | 只比较可核验 KPI，不把同业表现归为因果 |
| `company_only` | 无可验证关系，或角色冲突/缺失 | 只生成公司解读和后续验证；产业传导显示“关系证据不足” |

### 确定性路由规则

1. 只读取 `company`、`results.guidanceText`、`segmentRevenue`、`financials`、`filings`、`transcript`、`news` 以及其有效 `sourceIds`；不读取模型记忆。
2. 先由确定性规则提取可引用的关系候选与关键词，再把候选列表交给模型排序和解释。模型不能新增 ticker、公司名或关系边。
3. 若同一关系没有至少一个有效 `sourceId`，删除该关系候选；若所有候选删除，路由 `company_only`。
4. `conflicts`、关键能力 `unavailable`、来源审计缺口或 demo 数据会降低角色和传导的置信度；冲突不以模型投票解决。

## 5. 证据语义与输出模型

当前 MVP 使用精简的 `EarningsInterpretation` 合同：结论、公司驱动、反向证据、观察项与传导边分别存储；每项包含 `evidenceType`、`sourceIds` 和 `confidence`，传导边额外包含 `from/to/relation/lag`。下述 `DeepClaim` 是下一版完整合同，`counterEvidence`、验证条件和结构化时滞尚未逐条内嵌，不能在本次 MVP 中宣称已经实现。

### 三类陈述

- `fact`：已在当前快照的结构化字段或来源文本中出现的可核验描述。必须有至少一个有效 `sourceId`；带数字时应与已传入字段一致。
- `inference`：由一个或多个事实导出的条件性解释。必须写明触发机制、反证和时间时滞；不能使用“必然”“确定受益”等绝对表述。
- `to_verify`：尚未被当前快照证明、但会改变当前判断的检查项。必须包含下一证据、检查窗口和通过/不通过标准；不能伪装为已知事实。

### 每条 claim 的统一字段

```ts
type ClaimKind = "fact" | "inference" | "to_verify";
type Confidence = "high" | "medium" | "low";

interface DeepClaim {
  id: string;
  kind: ClaimKind;
  text: string;
  sourceIds: string[] | "unavailable";
  confidence: Confidence;
  confidenceReason: string;
  counterEvidence: string[];
  lag: {
    window: "current" | "0-1q" | "1-2q" | "2-4q" | "4q_plus" | "unknown";
    rationale: string;
  };
  nextEvidence?: string;
  passCondition?: string;
  failCondition?: string;
}
```

`sourceIds` 必须来自当前 `analysis.sources`，并可继续由现有 `SourceList` 解析。`unavailable` 只可用于明确声明“当前无来源可支持”的待验证项；不得用于 `fact`。反证不是免责声明：它应指出会推翻或显著削弱本条推断的相反数据、替代解释或缺失证据。

置信度先由确定性门槛上限约束：来源冲突或必需来源缺失时最高 `low`；只有多个独立且一致的当前来源、角色关系有来源、无冲突时才可 `high`。模型只能下调，不能上调这个上限。

## 6. GOOG Capex 传导示例（结构示例，非实时结论）

该例说明输出形态；其中不声明任何当前 GOOG 财报事实、数值或供应商关系。实际运行必须从当次快照中取得来源，否则降级为 `company_only`。

**路由条件：** 当 Alphabet/GOOG 的当期结果、财务报表、公告或电话会明确披露 AI/数据中心相关 Capex、容量部署或采购节奏，并各自有有效 `sourceIds` 时，角色候选为 `demand_initiator`。

```text
公司披露的 Capex / 部署计划 [fact, sourceIds: GOOG-results-or-filing]
  → 建设与交付需求可能增加 [inference, 0-1q]
  → 已有来源明确关联的基础设施节点才可显示 [inference, 1-2q]
  → 节点公司的收入/毛利率是否兑现 [to_verify, 2-4q]
```

示例卡片应写成：

- 事实：`当期公司资料披露了与数据中心/AI 基础设施相关的资本支出或部署信息。` 仅在 `results`、`financials`、`filings` 或 `transcript` 有对应来源时出现。
- 推断：`若该支出对应新增建设而非既有合同结算或一次性项目，相关建设链条的需求可能在后续 0–2 个季度体现。` 置信度通常不高于 medium；反证包括 Capex 的非建设性构成、交付延后、供应受限、已有产能闲置，或披露并未指定相关采购。
- 待验证：`在后续公司文件、电话会或可核验节点披露中检查：Capex 组成、投运节奏、已知关系节点的订单/利用率/收入确认是否同向。` 不列出未经来源支持的公司 ticker。

这条链的时滞应写为区间而非精确预测：计划/采购信号可在 `current` 至 `0-1q`，建设与交付可能为 `1-2q`，收入和利润率验证可能为 `2-4q`；如果公司资料没有给出节奏，则 `unknown`。

## 7. NFLX company-only 示例（结构示例，非实时结论）

当 NFLX 当前快照只提供其自身收入、会员/广告相关 KPI、内容投入、指引或电话会材料，且不存在有来源的外部关系候选时：

- 角色为 `company_only`，公司解读可以分析“当前业绩与指引的变化、广告/订阅/内容成本等本公司证据”。
- 产业传导页不生成外部公司、设备、云、内容供应商或广告伙伴的因果链；显示“当前快照缺少可审计的跨公司关系，未生成产业传导”。
- 后续验证页可列“下一季公司披露中的会员、广告变现、内容摊销、经营利润率或指引变化”，每条注明当期来源和验证窗口。

这不是否认 NFLX 处在产业网络中，而是拒绝在当前证据不足时把常识性关系包装成研究结论。

## 8. DeepSeek JSON 合同

本节描述目标合同。MVP 已实现同等顶层视图，但使用精简 JSON：模型只能引用当前快照来源；`from/to` 必须精确选自后端给定的泛化节点；未知来源、无来源事实、未提供数字、外部 ticker 和任意传导节点会被确定性拒绝。完整的版本号、逐条反证和通过/失败条件属于后续升级。

### 输入

输入从 `redactForPrompt()` 的既有最小化策略扩展而来：只传当前 `EarningsAnalysis` 的必要字段、已经允许的 `sources`（`id`、标题、provider、capability）和确定性生成的角色候选。原始密钥、未脱敏运行时环境、D1 连接信息、原始缓存响应以及未被当前分析使用的来源都不得进入 prompt。

```ts
interface DeepInterpretationPrompt {
  contractVersion: "deep_interpretation_v1";
  ticker: string;
  analysisId: string;
  language: "en" | "zh";
  mode: ResolvedAnalysisMode;
  evidence: Pick<EarningsAnalysis,
    "company" | "event" | "estimates" | "results" | "marketReaction" |
    "financials" | "segmentRevenue" | "news" | "filings" | "transcript" |
    "missing" | "conflicts" | "confidence"
  >;
  allowedSourceIds: string[];
  roleCandidates: Array<{ role: string; evidenceSourceIds: string[]; rationale: string }>;
  deterministicClaims: Record<string, { text: string; sourceIds: ClaimSourceIds }>;
}
```

### 输出

```ts
interface DeepInterpretationResponse {
  contractVersion: "deep_interpretation_v1";
  companyRole: {
    primary: "demand_initiator" | "upstream_supplier" | "infrastructure_enabler" |
      "downstream_monetizer" | "peer_or_competitor" | "company_only";
    secondary: string[];
    sourceIds: string[] | "unavailable";
    confidence: Confidence;
    rationale: string;
  };
  views: {
    company: { claims: DeepClaim[] };
    transmission: { claims: DeepClaim[]; unavailableReason?: string };
    verification: { claims: DeepClaim[] };
  };
}
```

系统提示必须要求：只使用输入 JSON；只从 `allowedSourceIds` 选择引用；所有中文输出使用简体中文；每个推断带反证和时滞；无证据的产业传导返回空 `claims` 和 `unavailableReason`；不输出投资建议、预测价格或新的公司关系。使用 JSON object 模式、低温度和单次调用。

## 9. 确定性校验与合并

AI JSON 通过解析不代表可展示。合并到 `EarningsAnalysis.deepInterpretation` 前必须依次执行：

1. 合同版本、顶层键、枚举、数组长度（每视图最多 6 条）、每条文本长度（最多 180 个中文字符或等价字符）和必填字段校验；任一失败即整包拒绝。
2. `sourceIds` 去重并验证为 `analysis.sources` 的子集；`fact` 缺来源、任何未知来源、或 `companyRole` 没有对应 role candidate 时拒绝相应条目。
3. 数字守卫：AI 产生的数字、百分比、日期、季度或 ticker 必须在已传入的结构化证据/候选中出现；否则拒绝该条。不得把 `quote` 描述为 earnings-day reaction，须继续使用 `marketReaction`。
4. 角色守卫：`company_only` 以外的主角色必须能匹配确定性角色候选及其来源。产业传导边必须来自候选边；模型不得创建新节点。
5. 语义守卫：`fact` 只能复述确定性事实；`inference` 必须含非确定性措辞、至少一个反证和非 `unknown` 或明确 `unknown` 理由；`to_verify` 必须同时含下一证据、通过条件与失败条件。
6. 置信度守卫：应用当前 `confidence`、`conflicts`、`missing` 和 capability 状态的上限，模型不能提高置信度。通过的条目按原顺序写入；被拒条目记录为受控 `issues`（不回传模型原文）。

基础的 `summaryBullets`、`keyDrivers`、`riskSignals`、`qualityOfEarnings`、`watchNext` 和现有 `claimSourceIds` 仍由当前 `mergeGenerated()` 规则控制；深度解读是一个可选附加字段，绝不覆盖它们。

## 10. 失败降级与缓存持久化

### 失败降级

- 未配置模型、超时、网络/HTTP 错误、非 JSON、合同校验失败或全部条目被拒绝：保留原有确定性分析，`deepInterpretation` 为 `null`，并记录 `deepInterpretation: unavailable` 与受控 issue；页面显示“AI 深度解读暂不可用，基础研究与来源仍可用”。
- 仅产业关系证据不足：返回有效的公司/验证视图，产业视图为空并显示 `unavailableReason`；这不是模型故障，也不降低已有公司事实。
- D1 在生产中保存包含深度字段的快照失败：沿用当前 `saveAnalysis()` fail-closed 语义，不能返回看似成功但不可复现的深度快照。非生产可按现有规则回退内存，并明确不可持久化。
- 不重试模型调用，不把失败改为无来源的模型自由文本；用户可显式再次请求。

### 缓存与 D1

- 在 `EarningsAnalysis` 加入可选 `deepInterpretation`、`deepInterpretationVersion`、`deepInterpretationGeneratedAt` 和受控 `issues`，由现有 `analysis_json` 写入 `research_snapshots`。不增加新的 D1 表或绑定。
- 将 `includeDeepInterpretation` 与合同版本加入既有 `requestKey()`，防止基础快照与深度快照混淆；`analysisId` 继续代表一次不可变研究快照。
- 复用现有 30 分钟请求缓存。含 retryable provider/model issue 的快照不复用；长期 `research_snapshots` 仍保留，供带 `analysisId` 的审计与分享读取。
- `source_refs`、`event_facts` 和 `qveris_fetch_cache` 的写入、版本与保留规则不变。深度解释只保存 `sourceIds`，不复制原始来源正文或模型密钥。

## 11. 延迟与成本预算

预算以模型令牌和请求次数定义，不假定或写死外部模型价格；若响应未给 usage，则成本状态为 `unavailable`，不得估算成事实。

| 项目 | 预算 | 超限处理 |
| --- | --- | --- |
| 首屏基础分析 | 不新增模型阻塞 | 先完整显示既有基础页面 |
| 深度解读调用 | 同一 `analysisId`、同一合同版本最多 1 次 | 命中快照/缓存；不自动重试 |
| DeepSeek 超时 | 12 秒硬超时（比现有摘要 20 秒更短） | 降级为基础研究 |
| 模型输入 | 最多 4,000 tokens，保留已有截断：财务/分部 2 期、新闻/文件 5 条 | 继续删减低优先级新闻摘要，不删来源 ID |
| 模型输出 | 最多 1,200 tokens、每视图最多 6 条 | JSON 校验拒绝超长内容 |
| 用户等待 | 深度标签 p95 目标 <= 12 秒；首屏不受其影响 | 显示可取消的加载与基础研究入口 |

记录但不暴露敏感内容：合同版本、模型名、耗时、是否缓存、输入/输出 token usage（若提供）、校验拒绝计数、降级原因和最终深度状态。每个分析最多一次深度调用可防止切换三个标签时产生三倍费用。

## 12. 测试与验收标准

### 最小测试

- 单元：DeepSeek JSON 的合法输出、未知 `sourceIds`、无来源 `fact`、新增 ticker、虚构数字、缺少反证/验证条件、置信度越界、错误合同版本、超长数组，均按合同接受或拒绝。
- 单元：公司角色路由。含来源的 Capex/部署候选可成为 `demand_initiator`；没有关系候选的 NFLX 输入固定为 `company_only`，产业 view 空且有原因。
- 集成：复用 `analyzeEarnings` fixture，验证基础 `summaryBullets` 在深度 AI 成功、失败和拒绝三种情况下均不被覆盖；`claimSourceIds` 仍是有效来源子集。
- 持久化：保存后通过 `GET /api/earnings/analysis/[analysisId]` 读回同一 `deepInterpretation`；验证只使用 `research_snapshots`，现有 `source_refs`/`event_facts` 血缘不变；生产 D1 写失败返回受控失败而非内存成功。
- 路由/UI：`view` 三值可直达；历史 `analysisId` 不会刷新为最新快照；模型失败、company-only、缺来源、冲突和加载状态均可见且不遮挡 `SourceList`。
- 性能：mock 模型确认最多一次调用、12 秒超时会降级、输入截断生效；缓存命中不再调用模型。

### 验收

1. GOOG fixture 在提供 Capex/部署来源时生成带来源、反证和时滞的条件性传导链；删除该关系来源后自动退为 `company_only`，不保留任何外部节点。
2. NFLX fixture 无跨公司关系来源时，产业传导页明确不可用，但公司解读和后续验证仍可用。
3. 任一可见 `fact` 都能打开至现有来源列表；任一 `inference`/`to_verify` 都显示其类型、置信度、反证和时滞。
4. 缺少模型配置或模型返回不合约数据时，基础研究 API 和页面保持可用，不展示无来源 AI 文案。
5. 深度结果在生产只能在 D1 成功写入后返回；按 `analysisId` 复读得到同一结果，且没有新数据库、缓存或秘密进入源码/文档。

## 13. 实施边界

建议实施顺序：先扩展类型与确定性 role candidate/validator，再扩展同一 `aiSummary.ts` 调用的 JSON 合同，最后接入现有 analyze route、`research_snapshots` 和三个页面标签。不要先做跨公司关系抓取或自动标的映射；当前数据合同尚未证明这些关系可审计。
