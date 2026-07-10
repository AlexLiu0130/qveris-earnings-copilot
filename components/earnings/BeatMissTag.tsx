import type { BeatMiss, GuidanceVerdict } from "@/lib/earnings/types";
import { getDict } from "@/lib/i18n/server";

type Verdict = BeatMiss | GuidanceVerdict;

const STYLES: Record<string, string> = {
  beat: "text-beat border-beat/40",
  miss: "text-miss border-miss/40",
  inline: "text-inline border-line-strong",
  unavailable: "text-ink-faint border-line",
  raised: "text-beat border-beat/40",
  lowered: "text-miss border-miss/40",
  maintained: "text-inline border-line-strong",
  provided: "text-accent border-accent/40",
};

export async function BeatMissTag({ value }: { value: Verdict }) {
  const { t } = await getDict();
  return (
    <span className={`label inline-block border px-1.5 py-0.5 ${STYLES[value] ?? STYLES.unavailable}`}>
      {t.verdict[value] ?? value}
    </span>
  );
}
