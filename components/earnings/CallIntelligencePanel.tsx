import type { EarningsAnalysis } from "@/lib/earnings/types";
import { getDict } from "@/lib/i18n/server";
import type { Dict, Lang } from "@/lib/i18n/dict";
import { Cite } from "./Cite";

const TONE_CLASS: Record<string, string> = {
  more_positive: "text-beat",
  decreased: "text-beat",
  more_negative: "text-miss",
  increased: "text-miss",
  neutral: "text-inline",
  unchanged: "text-inline",
  unavailable: "text-ink-faint",
};

export async function CallIntelligencePanel({ analysis }: { analysis: EarningsAnalysis }) {
  const { lang, t } = await getDict();
  const { transcript, keyQuestions } = analysis;
  const conclusion = transcript?.available ? buildCallConclusion(transcript, t, lang) : null;

  return (
    <section className="panel p-5">
      <h2 className="font-display text-2xl italic text-ink">{t.call.title}</h2>

      {transcript?.available ? (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-4">
            <ToneItem label={t.call.managementTone} value={transcript.managementTone} tone={t.call.tone} />
            <ToneItem label={t.call.guidanceTone} value={transcript.guidanceTone} tone={t.call.tone} />
            <ToneItem label={t.call.riskLanguage} value={transcript.riskLanguage} tone={t.call.tone} />
          </dl>

          {conclusion && (
            <div className="mt-5 border-l-2 border-accent bg-accent-soft px-4 py-3">
              <p className="label text-accent">{t.call.conclusion}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">
                {conclusion}
                <Cite ids={transcript.sourceIds} sources={analysis.sources} />
              </p>
            </div>
          )}

          {transcript.repeatedQuestions && transcript.repeatedQuestions.length > 0 && (
            <div className="hairline mt-5 pt-4">
              <h3 className="label mb-2 text-accent">{t.call.repeatedQuestions}</h3>
              <ul className="space-y-1.5">
                {transcript.repeatedQuestions.map((question, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-ink-soft">
                    <span className="num text-accent-dim">Q</span>
                    {question}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {transcript.managementAnswers && transcript.managementAnswers.length > 0 && (
            <div className="hairline mt-5 pt-4">
              <h3 className="label mb-2 text-accent">{t.call.managementAnswers}</h3>
              <ul className="space-y-2.5">
                {transcript.managementAnswers.map((item, i) => (
                  <li key={`${item.topic}-${i}`} className="text-sm leading-relaxed text-ink-soft">
                    <span className="num mr-2 text-accent-dim">A</span>
                    <span className="text-ink">{item.topic}：</span>
                    {item.answer}
                    <Cite ids={item.sourceIds} sources={analysis.sources} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 border border-dashed border-line-strong p-4">
          <p className="label text-ink-soft">{t.call.unavailableTitle}</p>
          <p className="mt-1 text-sm text-ink-faint">{t.call.unavailableBody}</p>
        </div>
      )}

      {/* pre-call analyst questions come from the analysis payload, not the transcript */}
      {keyQuestions.length > 0 && (
        <div className="hairline mt-5 pt-4">
          <h3 className="label mb-2 text-accent">{t.preview.keyQuestions}</h3>
          <ol className="space-y-1.5">
            {keyQuestions.map((question, i) => (
              <li key={i} className="flex gap-3 text-sm text-ink-soft">
                <span className="num shrink-0 text-accent-dim">{String(i + 1).padStart(2, "0")}</span>
                {question}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function buildCallConclusion(
  transcript: NonNullable<EarningsAnalysis["transcript"]>,
  t: Dict,
  lang: Lang,
) {
  const management = toneText(transcript.managementTone, t);
  const guidance = toneText(transcript.guidanceTone, t);
  const risk = toneText(transcript.riskLanguage, t);
  const topics = transcript.repeatedQuestions?.slice(0, 4).join(lang === "zh" ? "、" : ", ");
  const answers = transcript.managementAnswers?.map((item) => item.topic).slice(0, 3).join(lang === "zh" ? "、" : ", ");

  if (lang === "zh") {
    const topicClause = topics
      ? `分析师追问集中在${topics}，说明后续判断重点应放在指引兑现、利润率路径和风险变化上。`
      : "后续判断重点应放在指引兑现、利润率路径和风险变化上。";
    const answerClause = answers ? `管理层回应覆盖${answers}。` : "";
    return `管理层语气为${management}，指引语气为${guidance}，风险措辞为${risk}。${topicClause}${answerClause}`;
  }

  const topicClause = topics
    ? `Analyst questions clustered around ${topics}, so the next read should focus on guidance delivery, margin path, and risk-language changes.`
    : "The next read should focus on guidance delivery, margin path, and risk-language changes.";
  const answerClause = answers ? ` Management responses covered ${answers}.` : "";
  return `Management tone is ${management}, guidance tone is ${guidance}, and risk language is ${risk}. ${topicClause}${answerClause}`;
}

function toneText(value: string | undefined, t: Dict) {
  const v = value ?? "unavailable";
  return (t.call.tone as Record<string, string>)[v] ?? v;
}

function ToneItem({
  label,
  value,
  tone,
}: {
  label: string;
  value?: string;
  tone: Record<string, string>;
}) {
  const v = value ?? "unavailable";
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className={`mt-1 text-sm ${TONE_CLASS[v] ?? "text-ink-faint"}`}>{tone[v] ?? v}</dd>
    </div>
  );
}
