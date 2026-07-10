# QVeris Earnings Copilot 前端改版文档

## 目标

把当前产品从“财报页面集合”改成“财报事件工作台”。

主链路：

```text
首页搜索 / 日历发现事件 -> Ticker 财报事件页 -> 分享页 / API
```

本轮只改页面信息架构和模块职责，不展开具体视觉风格细节。

## 页面职责

### 1. 首页 `/earnings`

定位：产品入口页。

保留模块：

- 搜索/命令入口：输入 ticker 后进入 `/earnings/[ticker]`
- 本周重点财报：展示核心 universe 中近期 upcoming / reported 事件
- 最近财报：展示最近已发布财报
- 日历入口：进入完整财报日历
- 开发者入口：弱入口

删除或弱化：

- Featured previews
- Trending briefs
- 大面积 covered companies 展示
- 完整分析内容
- 重复卡片列表

首页不承担研究分析，只负责让用户快速进入事件。

### 2. 财报日历 `/earnings/calendar`

定位：operational calendar。

页面模块：

- 月份切换
- 视图切换：月历 / 表格
- 筛选：universe、状态、报告时段、行业
- 月历格子：展示 ticker、AM/PM、状态
- 表格视图：展示 ticker、公司、日期、报告时段、EPS estimate、Revenue estimate、状态、进入 brief
- 空状态：说明当前筛选无事件，并提示清除筛选或切换月份

暂不做：

- Google/Outlook calendar 导出
- 登录态 watchlist
- portfolio 级别过滤

### 3. Ticker 财报事件页 `/earnings/[ticker]`

定位：核心工作台。

页面顺序：

1. **Event Header**
   - 公司名、ticker、exchange
   - 当前财报事件日期、季度、报告时段
   - 状态 pipeline：
     `Calendar confirmed -> Report released -> Slides/filing found -> Transcript found -> Brief generated`
   - 缺失项明确展示，例如 `transcript unavailable`

2. **One-line Verdict**
   - 一句话总结本次财报
   - 显示 confidence
   - 不展示买卖建议、评级、目标价

3. **Key Metrics**
   - Revenue actual / estimate / surprise
   - EPS actual / estimate / surprise
   - Margin
   - Guidance
   - Market reaction
   - 缺数据时显示 unavailable，不做推断

4. **What Changed**
   - 相比上季度或去年同期的变化
   - 建议字段：Revenue、EPS、Margin、Guidance、Management tone

5. **Management Commentary**
   - 管理层叙事摘要
   - 可按主题分组：Demand、Margins、Guidance、Capex、AI、China、Inventory
   - 每条内容需要 source ref

6. **Q&A / Call Intelligence**
   - 分析师最关心的问题
   - 重复问题
   - 管理层强调或回避的点
   - 没有 transcript 时整块显示 unavailable

7. **News / Filings / Sources**
   - 汇总新闻、filings、transcript、calendar、estimates 等来源
   - 作为底部区块或 source drawer
   - 所有数字和判断应能回溯来源

8. **Actions**
   - Copy Markdown
   - Share page
   - API / JSON

### 4. 研究简报页 `/earnings/briefs`

定位：brief feed。

模块：

- Latest flash reports
- Upcoming previews
- Thematic buckets：
  - AI
  - Semiconductors
  - Mega-cap tech
  - China ADRs

Brief card 只展示：

- ticker
- event date
- one-line summary
- status
- confidence

点击后进入 `/earnings/[ticker]`，不在 feed 页承载完整分析。

### 5. 分享页 `/earnings/[ticker]/share`

定位：可外发的精简简报。

只展示：

- company / event
- one-line verdict
- key metrics
- 3-5 条核心 bullet
- source summary
- disclaimer

不展示：

- 完整内部工作流
- 开发者解释
- 过多来源细节
- 调试字段

### 6. 开发者页 `/developers/earnings`

定位：解释 QVeris 数据工作流和 API 输出。

模块：

- API capability overview
- Workflow：
  `Discover capabilities -> Pull calendar/results/transcript/news/filings -> Validate -> Synthesize -> Return sourced JSON`
- 示例 JSON
- Source refs 说明
- Missing fields 说明
- Confidence scoring 说明
- CTA：查看 spec / 调用 API

重点表达：

- QVeris 能力来自 capability registry
- 每个关键字段应有来源
- 缺失字段明确披露
- 输出是可审计 JSON，而不是不可验证的 AI 文案

## 数据状态规范

前端所有页面统一使用以下状态语义：

- `available`：数据存在且可引用
- `partial`：部分字段存在
- `unavailable`：能力或数据不存在
- `conflict`：多个来源冲突
- `demo`：仅测试或示例数据

展示要求：

- 不隐藏 unavailable
- 不把 unavailable 渲染成空白
- 不用 AI 猜测缺失数字
- 重要判断必须显示 confidence

## 本轮不做

- 登录
- 用户 watchlist
- portfolio
- 多 ticker 对比
- 自由聊天
- 日历导出
- 复杂权限系统

## 验收标准

- 首页能在 5 秒内看懂入口和近期重点事件
- 日历能按月份浏览 core universe 财报
- Ticker 页能一眼看出当前 event 状态和缺失项
- 所有关键数字和判断都有 source 或 unavailable
- 分享页可直接外发
- Developers 页能让前端/后端/外部开发者理解 API 输出结构
