import Link from "next/link";
import { EarningsSearchBox } from "@/components/earnings/EarningsSearchBox";
import { getDict } from "@/lib/i18n/server";

const copy = {
  en: {
    kicker: "QVERIS EARNINGS INTELLIGENCE",
    titlePre: "The research desk behind every ",
    titleEm: "earnings event",
    titlePost: ".",
    sub:
      "Turn calendar events, consensus, filings, news, calls, and market reaction into source-cited research packets. Every claim carries evidence, and every missing field stays visible.",
    enter: "Open console",
    calendar: "View calendar",
    systemLabel: "RESEARCH RUN",
    systemTitle: "From event to audit-ready brief",
    systemBody: "One workflow gathers the available QVeris capabilities, validates conflicts, then produces a brief that can be read, shared, or called through the API.",
    contract: "EVIDENCE CONTRACT",
    contractItems: ["No invented numbers", "Missing data disclosed", "Research only"],
    stats: [
      ["Calendar", "Upcoming and reported earnings window"],
      ["Estimates", "Consensus, surprise, and revision context"],
      ["Transcripts", "Management tone and analyst Q&A when available"],
      ["Share", "Public cards with sources and disclaimers"],
    ],
    sectionKicker: "OPERATING MODEL",
    sectionTitle: "A sharper homepage for a serious earnings workflow.",
    sectionBody:
      "The homepage is now a clean product doorway. It explains what QVeris Earnings does, shows the research path, and routes users into the live console without pretending static landing-page data is real.",
    cards: [
      ["Prepare", "Find the next relevant earnings event and load company context."],
      ["Compare", "Read actuals against estimates, history, guidance, and market reaction."],
      ["Listen", "Extract management narrative and analyst questions from call materials."],
      ["Publish", "Generate a sourced research page, share card, or API response."],
    ],
    workflowTitle: "Built for auditable research, not a one-line summary.",
    workflowBody:
      "Each run keeps provenance beside the conclusion. If a capability is absent, the output degrades honestly instead of filling the gap with prose.",
    flow: [
      ["Discover", "calendar, profile, coverage"],
      ["Collect", "results, estimates, filings, news, transcript"],
      ["Validate", "conflicts, missing fields, evidence quality"],
      ["Synthesize", "drivers, risks, narrative, watch-next"],
      ["Output", "console, share page, image, API JSON"],
    ],
    ctaTitle: "Start with a ticker or browse the live calendar.",
    ctaBody: "QVeris Earnings is research infrastructure. It does not issue buy, sell, hold ratings or price targets.",
  },
  zh: {
    kicker: "QVERIS 财报研究副驾",
    titlePre: "把每一次",
    titleEm: "财报事件",
    titlePost: "变成可审计的研究结论。",
    sub:
      "从财报日历、市场预期、公告文件、新闻、电话会和市场反应中提取证据，生成带来源引用的研究包。每个结论有出处，每个缺口都明确展示。",
    enter: "进入控制台",
    calendar: "查看财报日历",
    systemLabel: "RESEARCH RUN",
    systemTitle: "从财报事件到可审计简报",
    systemBody: "同一条工作流调用 QVeris 可用能力，校验冲突，再输出可阅读、可分享、可通过 API 调用的研究简报。",
    contract: "证据契约",
    contractItems: ["不编造数字", "缺失项明确展示", "仅供研究参考"],
    stats: [
      ["日历", "近期已发布与即将发布的财报窗口"],
      ["预期", "市场一致预期、差异与修正背景"],
      ["电话会", "可用时提取管理层叙事与分析师问答"],
      ["分享", "带来源、免责声明和传播卡片的公开页面"],
    ],
    sectionKicker: "工作方式",
    sectionTitle: "首页是入口，不是数据看板。",
    sectionBody:
      "新的首页只承担产品入口和能力说明：讲清 QVeris Earnings 做什么、研究路径如何运转，并把用户导向真实拉取数据的控制台。",
    cards: [
      ["准备", "识别相关财报事件，并加载公司基础信息。"],
      ["对比", "把实际业绩放到预期、历史、指引和市场反应里看。"],
      ["听读", "从电话会材料中整理管理层叙事和分析师追问。"],
      ["发布", "生成带来源的研究页、分享卡或 API 响应。"],
    ],
    workflowTitle: "它不是一句总结，而是一条可追溯的研究链。",
    workflowBody:
      "每次分析都把来源、能力状态和缺失字段放在结论旁边。能力缺失时，系统会诚实降级，而不是用流畅的话术补洞。",
    flow: [
      ["发现", "日历、公司、覆盖范围"],
      ["采集", "业绩、预期、公告、新闻、电话会"],
      ["校验", "冲突、缺失字段、证据质量"],
      ["综合", "驱动因素、风险、叙事、后续关注"],
      ["输出", "控制台、分享页、图片、API JSON"],
    ],
    ctaTitle: "输入代码，或浏览财报日历。",
    ctaBody: "QVeris Earnings 是研究基础设施，不输出买卖评级，也不提供目标价。",
  },
};

export default async function Home() {
  const { lang, t } = await getDict();
  const c = copy[lang];

  return (
    <div className="home-shell -mt-8">
      <section className="home-hero">
        <div className="home-hero-copy rise rise-1">
          <p className="label text-accent">{c.kicker}</p>
          <h1>
            {lang === "zh" ? (
              <>
                <span>把每一次</span>
                <em>财报事件</em>
                <span>变成</span>
                <span>可审计的</span>
                <span>研究结论。</span>
              </>
            ) : (
              <>
                {c.titlePre}
                <em>{c.titleEm}</em>
                {c.titlePost}
              </>
            )}
          </h1>
          <p className="home-lede">{c.sub}</p>
          <div className="home-actions">
            <Link href="/earnings" className="home-primary">
              {c.enter}
              <span aria-hidden="true">→</span>
            </Link>
            <Link href="/earnings/calendar" className="home-secondary">
              {c.calendar}
            </Link>
          </div>
          <div className="home-search">
            <EarningsSearchBox large placeholder={t.search.placeholder} buttonLabel={t.search.button} />
          </div>
        </div>

        <aside className="home-console rise rise-2" aria-label={c.systemTitle}>
          <div className="home-console-top">
            <span>
              <i />
              <i />
              <i />
            </span>
            <b>{c.systemLabel}</b>
          </div>
          <div className="home-console-body">
            <p className="label text-accent">{c.contract}</p>
            <h2>{c.systemTitle}</h2>
            <p>{c.systemBody}</p>
            <div className="home-contract">
              {c.contractItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
          <div className="home-scan" aria-hidden="true">
            <span />
          </div>
        </aside>
      </section>

      <section className="home-stat-grid rise rise-3" aria-label="QVeris capabilities">
        {c.stats.map(([title, body]) => (
          <article key={title}>
            <strong>{title}</strong>
            <span>{body}</span>
          </article>
        ))}
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <div>
            <p className="label text-accent">{c.sectionKicker}</p>
            <h2>{c.sectionTitle}</h2>
          </div>
          <p>{c.sectionBody}</p>
        </div>
        <div className="home-card-grid">
          {c.cards.map(([title, body], index) => (
            <article key={title} className="home-card">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-workflow">
        <div className="home-workflow-copy">
          <p className="label text-accent">{t.common.workflow}</p>
          <h2>{c.workflowTitle}</h2>
          <p>{c.workflowBody}</p>
        </div>
        <div className="home-flow">
          {c.flow.map(([title, body], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-cta">
        <h2>{c.ctaTitle}</h2>
        <p>{c.ctaBody}</p>
        <div className="home-actions justify-center">
          <Link href="/earnings" className="home-primary">
            {c.enter}
            <span aria-hidden="true">→</span>
          </Link>
          <Link href="/developers/earnings" className="home-secondary">
            {t.devCta.link}
          </Link>
        </div>
      </section>
    </div>
  );
}
