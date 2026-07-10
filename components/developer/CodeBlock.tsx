import { CopyButton } from "@/components/earnings/CopyButton";

/* Minimal line-based highlighter for the static JSON/bash/TS examples.
   ponytail: regex tokenizer, swap for shiki if examples ever get complex. */
const TOKEN = /("[^"]*")(\s*:)|("[^"]*")|(\/\/[^\n]*|#[^\n]*)|\b(\d+(?:\.\d+)?)\b|\b(true|false|null|const|await|async|fetch|return)\b/g;

function highlightLine(line: string, key: number) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of line.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(line.slice(last, index));
    const [, jsonKey, colon, str, comment, num, kw] = match;
    if (jsonKey) {
      parts.push(<span key={i++} className="text-code-key">{jsonKey}</span>, colon);
    } else if (str) {
      parts.push(<span key={i++} className="text-code-string">{str}</span>);
    } else if (comment) {
      parts.push(<span key={i++} className="text-code-comment">{comment}</span>);
    } else if (num) {
      parts.push(<span key={i++} className="text-code-num">{num}</span>);
    } else if (kw) {
      parts.push(<span key={i++} className="text-code-key">{kw}</span>);
    }
    last = index + match[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return <span key={key}>{parts}{"\n"}</span>;
}

export function CodeBlock({
  title,
  code,
  copy,
  copied,
}: {
  title: string;
  code: string;
  copy: string;
  copied: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-code-line bg-code-header shadow-sm shadow-ink/10">
      <div className="flex items-center gap-3 border-b border-code-line px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-code-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-code-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-code-line" />
        </span>
        <span className="label flex-1 truncate !text-code-comment">{title}</span>
        <CopyButton text={code} label={copy} copiedLabel={copied} variant="dark" />
      </div>
      <pre className="num m-4 overflow-x-auto rounded-md bg-code-bg p-4 text-xs leading-relaxed text-code-text">
        {code.split("\n").map((line, i) => highlightLine(line, i))}
      </pre>
    </div>
  );
}
