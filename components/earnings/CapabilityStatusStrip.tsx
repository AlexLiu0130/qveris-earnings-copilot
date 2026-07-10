import type { CapabilityState } from "@/lib/earnings/types";
import { getDict } from "@/lib/i18n/server";

const DOT: Record<CapabilityState, string> = {
  available: "bg-beat",
  partial: "bg-warning",
  unavailable: "bg-line-strong",
  conflict: "bg-conflict",
  demo: "bg-demo",
};

export async function CapabilityStatusStrip({ status }: { status: Record<string, CapabilityState> }) {
  const { t } = await getDict();
  return (
    <div className="panel flex flex-wrap gap-x-4 gap-y-2 px-4 py-3">
      {Object.entries(status).map(([capability, state]) => (
        <span key={capability} className="label flex items-center gap-1.5" title={`${capability}: ${state}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[state]}`} />
          {t.capLabel[capability as keyof typeof t.capLabel] ?? capability}
          <span className="text-line-strong">·</span>
          <span className={state === "unavailable" ? "text-ink-faint" : state === "demo" ? "text-demo" : state === "conflict" ? "text-conflict" : "text-ink-soft"}>
            {t.capState[state]}
          </span>
        </span>
      ))}
    </div>
  );
}
