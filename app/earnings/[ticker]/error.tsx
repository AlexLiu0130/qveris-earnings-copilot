"use client";

export default function TickerError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <p className="label text-accent">Earnings analysis error</p>
      <h1 className="mt-3 font-display text-4xl text-ink">Unable to load this brief</h1>
      <p className="mt-3 text-sm text-ink-soft">
        Data service temporarily unavailable. 数据服务暂时不可用。
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="label mt-6 border border-accent px-4 py-2 text-accent transition-colors hover:bg-accent hover:text-canvas"
      >
        Retry / 重试
      </button>
    </div>
  );
}
