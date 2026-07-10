import type { ConfidenceLabel } from "@/lib/earnings/types";
import { getDict } from "@/lib/i18n/server";

const STYLES: Record<ConfidenceLabel, string> = {
  high: "border-beat text-beat",
  medium: "border-warning text-warning",
  low: "border-miss/60 text-miss",
};

export async function ConfidenceBadge({ label, reason }: { label: ConfidenceLabel; reason?: string }) {
  const { t } = await getDict();
  return (
    <span
      title={reason}
      className={`label inline-flex whitespace-nowrap items-center gap-1.5 border px-2 py-1 ${STYLES[label]}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {t.common.confidence} · {t.common.confidenceLevels[label]}
    </span>
  );
}
