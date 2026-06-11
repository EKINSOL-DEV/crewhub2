import { useState } from "react";
import type { ItemProps } from "./types";

export const THINKING_COLLAPSE_CHARS = 500;

/** Thinking: collapsed beyond 500 chars; redacted ⇒ private placeholder (D-M2-5). */
export function ThinkingBlock({ item }: ItemProps) {
  const [expanded, setExpanded] = useState(false);
  if (item.kind !== "Thinking") return null;

  if (item.data.redacted || item.data.text == null) {
    return (
      <div className="px-3 py-1 text-xs italic text-muted-foreground" data-testid="thinking-redacted">
        🔒 thinking privately…
      </div>
    );
  }

  const text = item.data.text;
  const long = text.length > THINKING_COLLAPSE_CHARS;
  return (
    <div className="px-3 py-1" data-testid="thinking-block">
      <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
        <div className="not-italic">🧠 thinking</div>
        <div className="mt-1 whitespace-pre-wrap">
          {long && !expanded ? `${text.slice(0, THINKING_COLLAPSE_CHARS)}…` : text}
        </div>
        {long && (
          <button
            type="button"
            data-testid="thinking-toggle"
            className="mt-1 not-italic text-accent hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "show less" : `show all (${text.length.toLocaleString()} chars)`}
          </button>
        )}
      </div>
    </div>
  );
}
