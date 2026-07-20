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
                    <div>
                      <p>{lang === "zh" ? transcript.questionTranslations?.[i] ?? question : question}</p>
                      {lang === "zh" && transcript.questionTranslations?.[i] && <OriginalText text={question} />}
                    </div>
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
                    <span className="text-ink">{lang === "zh" ? item.topicTranslation ?? item.topic : item.topic}：</span>
                    {lang === "zh" ? item.answerTranslation ?? item.answer : item.answer}
                    <Cite ids={item.sourceIds} sources={analysis.sources} />
                    {lang === "zh" && item.answerTranslation && <OriginalText text={`${item.topic}: ${item.answer}`} />}
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

function OriginalText({ text }: { text: string }) {
  return (
    <details className="mt-1 text-xs text-ink-faint">
      <summary className="cursor-pointer select-none">英文原文</summary>
      <p className="mt-1 leading-relaxed">{text}</p>
    </details>
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
  const questionCount = transcript.repeatedQuestions?.length ?? 0;
  const answerCount = transcript.managementAnswers?.length ?? 0;

  if (lang === "zh") {
    return `管理层语气为${management}，指引语气为${guidance}，风险措辞为${risk}。已从原始电话会记录提取 ${questionCount} 个分析师问题和 ${answerCount} 组紧邻的管理层回应。`;
  }

  return `Management tone is ${management}, guidance tone is ${guidance}, and risk language is ${risk}. Extracted ${questionCount} analyst questions and ${answerCount} adjacent management responses from the original transcript.`;
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
