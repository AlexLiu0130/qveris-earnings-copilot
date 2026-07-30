# QVeris 财报固定工具矩阵

生产代码只允许调用 `lib/capabilities/qverisEarningsTools.ts` 中固定的工具 ID，不在请求时动态搜索或让模型选择工具。

## 核心口径

| 数据 | 固定来源 | 用途 |
|---|---|---|
| 财报日历 | Alpha Vantage Earnings Calendar | 未来财报日期、时段和日历 EPS 预期 |
| 单季市场预期 | Finnhub Earnings Calendar | 已知财报事件的营收/EPS 实际值与市场预期 |
| 历史 EPS | Finnhub Earnings Surprises | 多季 EPS 实际值、预期值和超预期幅度 |
| 财报发布日期 | Twelve Data Earnings | 只取发布日期，不采用其 EPS 数值 |
| 财务报表 | FMP Income Statement / Balance Sheet / Cash Flow | 营收、利润率、净利润、现金流和资产负债表 |
| 电话会 | Alpha Vantage Earnings Call Transcript | 管理层陈述、分析师问答和业绩指引文本 |
| 公告文件 | SEC submissions + FMP SEC filings | 10-Q、8-K、6-K 等监管文件 |
| 公司与市值 | Finnhub Profile + FMP Batch Market Cap | 公司身份、行业和页面排序 |
| 行情 | EODHD delayed quote + FMP dividend-adjusted EOD | 当前报价与财报事件窗口行情 |
| 分部与新闻 | FMP Revenue Segmentation + QVeris Finance News | 业务结构和事件背景 |

## 上线门槛

运行：

```bash
npm run probe:qveris:earnings
```

探针同时检查注册、执行成功、必需字段、空结果和运行时 schema。任何财报工具返回 `interval=1min/5min/...` 等技术指标参数时直接失败。

当前被禁用的两个工具：

- `alphavantage.earnings.retrieve.v1.467a92c0`
- `alphavantage.earnings_estimates.retrieve.v1.467a92c0`

它们的注册信息是财报能力，但执行端实际绑定到要求 `interval` 的技术指标 schema，不能进入生产链路。

## 2026-07-30 批量验收

固定矩阵的 30 个执行探针通过 29 个：

- 财报日历、指数成分、公司资料、市值、行情、新闻、公告、电话会、三张财务报表和分部收入均通过。
- MU、GOOGL、JPM、TSM、ASML 的历史 EPS 实际值、预期值和财报发布日期均通过。
- GOOGL、JPM、TSM、ASML 的单季营收/EPS 一致预期均通过。
- Finnhub `Earnings Calendar` 实测只返回最近约 30 天及未来事件的完整营收/EPS 实际值与一致预期；2026-07-30 测试时，2026-06-30 可用，2026-06-29 及以前全市场查询为空。
- MU 2026-06-24 因超出该滚动窗口而无法实时回溯，不是 MU 特例。系统不会使用新闻或模型生成数字。
- ADR 会返回原始上市代码，例如 `ASML -> ASML.AS`、`TSM -> 2330.TW`，业务层必须按查询事件身份归一化。
- `twelvedata.epsrevisions.retrieve.v1.ff79b31c` 对当前 QVeris 权限统一返回 403，因此分析师预期修正继续明确标记不可用，不接入失败工具。

因此，本轮修复消除了错误工具路由，但 MU 历史营收一致预期仍需要已存快照或新的结构化固定来源才能补齐。

## 时点数据归档

生产环境每天运行一次：

```bash
PERSISTENCE_DRIVER=sqlite \
SQLITE_DATABASE_PATH=/data/earnings.db \
npm run archive:qveris:estimates
```

任务使用本表固定 Tool ID 抓取未来 21 天核心覆盖事件，将非空营收/EPS 预期按版本写入 `event_facts`，并保存 `source_refs` 与原始 QVeris 执行血缘。后续空响应不会覆盖已经保存的事实。可用 `EARNINGS_ARCHIVE_DAYS=1..120` 调整窗口。
