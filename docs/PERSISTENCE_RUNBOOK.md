# 持久化运维交接

面向 Claude / 工程交接。当前仓库状态：实现完成但尚未确认线上部署；不要把本地 `dist/`、`.openai/hosting.json` 或 Git 分支名视为已上线证明。

## D1 数据模型

当前 D1 迁移只有 `drizzle/0000_lethal_grandmaster.sql`，共 5 张表：

| 表 | 用途 | 关键保留规则 |
|---|---|---|
| `qveris_fetch_cache` | QVeris 原始工具响应缓存，按 `cache_key` 去重，保存参数、响应、响应 hash、执行 id、拉取时间、过期时间和 schema 版本。 | 有 TTL；被 `source_refs.raw_fetch_id` 或 `event_facts.raw_fetch_id` 引用的 raw row 为长期血缘资产；retention 只清理未引用且已过期超过 90 天的行。 |
| `earnings_events` | 财报事件事实表，保存 ticker、财年/季度、报告日、盘前/盘后、状态、`event_version` 和 first/last seen。 | `event_version` 为报告日 `YYYYMMDD`；同一 `canonical_key` 的日期修订以不同版本共存，保留可追溯历史。 |
| `source_refs` | 来源引用表，保存 provider/capability/execution/raw fetch/title/url/published/retrieved/hash。按 execution 版本不可变，`raw_fetch_id` 只关联已存在的 `qveris_fetch_cache` raw row；没有匹配 raw row 时为 `null`。 | research asset；当前无自动删除策略。 |
| `event_facts` | 从分析结果抽取的事件事实，如 revenue/eps actual/estimate、margin、guidance、market reaction。`raw_fetch_id` 跟随对应 source ref，同步指向现存 raw row；没有 raw row 时为 `null`。 | research asset；当前无自动删除策略。 |
| `research_snapshots` | 分析快照，保存完整 `analysis_json`、request key、ticker、mode、language、生成时间和请求缓存过期时间。 | 快照用于复用和历史展示；当前无自动删除策略。 |

## Raw Cache TTL 与清理

`lib/capabilities/qverisFetchCache.ts` 定义 raw cache TTL：

| 工具类型 | TTL |
|---|---:|
| quote | 1 分钟 |
| calendar / estimates | 30 分钟 |
| news | 15 分钟 |
| filing | 60 分钟 |
| profile | 7 天 |
| transcript | 30 天 |
| earnings.retrieve / incomeStatement / balanceSheet / cashFlow / revenueProductSegmentation | 24 小时 |
| 其他工具 | 15 分钟 |

清理规则：

- 只清理 `qveris_fetch_cache`。
- raw fetch cache 是 best-effort / fail-open：D1 读写或 retention 失败会记录错误并继续请求，不保证每次原始响应都能落 D1。
- raw fetch cache fail-open 不改变最终 analysis 持久化规则；生产 analysis 保存仍必须写入 D1。
- 每个运行时实例最多每小时触发一次 retention。
- 删除条件是未被 `source_refs.raw_fetch_id` 或 `event_facts.raw_fetch_id` 引用，且 `expires_at < now - 90 天`，即“未引用并已过期超过 90 天”。
- 大于 1.5MB 的原始响应不会写入 D1，只进入本地内存 fallback。

## Analysis Persistence / Research Asset 留存

- `saveAnalysis()` 在有 D1 时会先写入 `earnings_events`、`source_refs`、`event_facts`，再写 `research_snapshots`。
- `source_refs` 的存储 id 使用 `source.id` 加 `executionId`（缺失时用 retrievedAt）形成 execution 版本；已存在的版本不会被覆盖。
- `source_refs.raw_fetch_id` 通过 `executionId` 查找现存 `qveris_fetch_cache.cache_key`；raw cache 未落库或已不存在时写 `null`。
- `event_facts.raw_fetch_id` 与所选 source ref 保持一致，支持从 fact 追溯到同一次 provider execution 的 raw row。
- 一旦 raw row 被 `source_refs.raw_fetch_id` 或 `event_facts.raw_fetch_id` 引用，90 天 retention 不会删除该 `qveris_fetch_cache` 行；未引用 raw cache 仍按 TTL + 90 天窗口清理。
- 生产运行时是 fail-closed：缺少 `DB` binding、D1 读取失败、D1 写入失败或 event fact revision 冲突都会让 analysis 请求失败，不会静默退到内存。
- 非生产运行时才允许 D1 不可用时退到本地内存。
- `research_snapshots.cache_expires_at` 只控制同请求复用窗口，当前默认 30 分钟；有 retryable issue 的结果会立即过期，但行仍保留。
- 当前没有 research snapshots、event facts、source refs、earnings events 的自动清理任务；容量、合规或成本需要另行定义人工归档/删除策略。

## Analyze / Fiscal Identity 行为

- `POST /api/earnings/analyze` 在部分 provider 能力失败但仍有可用 evidence 时返回结构化 partial：`capabilityStatus`、`missing`、`issues` 会说明缺口。
- 当全部 provider evidence 都不可用时，analyze 不返回空分析，直接返回安全错误：`502 { "error": "EARNINGS_DATA_UNAVAILABLE" }`。
- `getEarningsEstimates()` 在已知 event 时使用完整 fiscal identity（`fiscalYear` + `fiscalPeriod`）匹配估值，不再按最近日期猜季度。

## 多季度 API

- 路由：`GET /api/earnings/history/[ticker]?limit=N`。
- `limit` 默认 8，允许 1 到 12。
- 数据来源是 `research_snapshots` 中同 ticker 的最近分析；只有非生产运行时 D1 不可用时才会退到当前运行时内存。
- 输出由 `buildQuarterComparison()` 合并当前事件、`historicalPattern` 和 `financials`，按日期倒序返回。
- 冷库没有历史快照时会返回 `quarters.length < limit`，这是数据不足，不是 API 本身成功覆盖多季度。

## 本地内存 Fallback 限制

- 非生产运行时，D1 binding 不存在、读取失败或写入失败时，系统可退到本地内存。
- 生产运行时，analysis persistence/read 路径要求 D1；不能把本地 fallback 当作生产降级方案。
- raw fetch memory cache 上限 500 条，按进程内 Map 保存，进程重启/实例切换即丢失。
- analysis memory store 上限 200 个 analysis；request cache 过期后只删除 request 索引，不保证历史长期存在。
- 多实例、冷启动、Sites 边缘运行时之间不共享内存；不能把本地 fallback 当作生产持久化。

## Sites / D1 / Secrets

- `.openai/hosting.json` 当前声明 `project_id` 和 D1 binding 名 `DB`，`r2` 为 `null`。
- 运行时代码通过 `getCloudflareContext().env.DB` 找 D1；生产必须提供名为 `DB` 的 D1 binding。
- `scripts/prepare-sites-open-next.mjs` 会把 `.openai/hosting.json` 和 `drizzle/` 复制到 `dist/.openai/`，但这不等于迁移已自动应用。
- 不要虚构 Sites 自动迁移已验证；部署前必须人工确认 D1 数据库已绑定且迁移已执行。
- 生产 Sites 运行环境按交接已配置为 `EARNINGS_PROVIDER=qveris`、`EARNINGS_UNIVERSE=core`、`ALLOW_DEMO_DATA=false`，但线上仍旧版本未发布；不要把环境已配置等同于当前代码已上线。
- runtime secrets/config 只应配置在 Sites/运行时环境，不要写入源码、`dist/`、文档或聊天：`QVERIS_API_KEY`、`OPENAI_API_KEY`，以及需要覆盖默认值时的 `QVERIS_BASE_URL`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`EARNINGS_PROVIDER`、`EARNINGS_UNIVERSE`、`ALLOW_DEMO_DATA`。

## Secret-safe Build 与扫描

推荐构建命令：

```bash
npm run build:sites
```

该命令会：

- 先执行 Next build。
- 在临时 shadow app 中运行 OpenNext Cloudflare build，并删除本地 `.env*` 中出现过的环境变量名，降低 secret 被打包风险。
- 生成 Sites 需要的 `dist/`。
- 清除 `.open-next` 内残留的 `.env*` 文件。
- 运行 `node scripts/scan-dist-secrets.mjs` 扫描本地 `.env*` 里敏感变量的值是否出现在 `dist/` 或 `.open-next/`。

可单独复扫：

```bash
npm run scan:dist-secrets
```

限制：

- 扫描只覆盖本地 `.env*` 中可见的敏感值，以及当前 `dist/`、`.open-next/`；不扫描 Git 历史、远端配置、Sites runtime secrets 或日志。
- 本轮未执行任何 QVeris / OpenAI key 轮换。不要在文档、源码、产物、聊天或交接记录中写任何旧值或新值。

## 部署后 D1 冷启动验证清单

部署后第一次真实请求前后必须验证：

1. Sites runtime 存在 `DB` binding，且应用日志没有 `getCloudflareContext` / D1 binding 缺失错误。
2. D1 已应用当前迁移，5 张表均存在：`qveris_fetch_cache`、`earnings_events`、`source_refs`、`event_facts`、`research_snapshots`。
3. runtime secrets 已配置且未出现在 `dist/`、`.open-next/`、响应体或错误日志中。
4. 冷启动请求 `POST /api/earnings/analyze` 使用一个已知 ticker 返回 200；provider 缺 key 应返回受控错误而不是空数据。
5. 首次分析后 D1 出现 `research_snapshots` 行，并写入相关 event/source/fact 行；raw cache 有命中条件时写入 `qveris_fetch_cache`。
6. 立刻重复同一请求，应从 snapshot/request cache 复用；等待 TTL 后应重新分析或重新拉取，而不是返回陈旧 request cache。
7. `GET /api/earnings/history/[ticker]?limit=8` 能返回由快照聚合的多季度结果；若不足 8 条，应确认是历史快照不足。
8. 人工制造或等待过期 raw cache 后，确认 retention 只删除未被 raw fetch id 引用、且已过期超过 90 天的 `qveris_fetch_cache` 行；已被引用的 raw row 和 research 表都不删除。

## 回滚边界

- 回滚代码不等于回滚 D1 数据；D1 表结构和已写入数据需要单独备份、迁移或人工处理。
- 当前只有初始建表迁移；若未来增加破坏性迁移，必须先定义备份、兼容读写窗口和反向迁移。
- runtime secret 变更是独立操作；代码回滚不会恢复旧 key，也不应在文档或交接中记录任何 key 值。
- 如果部署后确认 secret 泄露，优先撤销暴露版本、清理日志/产物，并按当时的安全决策处理 runtime secret；不要只回滚代码。
- 如果 D1 binding 或迁移错误导致生产不可用，优先回滚到已知可用版本或临时禁用依赖 analysis 持久化的路径；不要声称当前生产实现会自动退回持久化内存模式。
