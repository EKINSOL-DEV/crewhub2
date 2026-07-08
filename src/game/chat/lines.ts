// Chat line mapping (M2 T1): projects a seq-keyed transcript into flat chat
// lines for the world chat windows. Text normalization ported from
// use-bot-chat.ts:19-38 (chatLine/linesFromItems) — same flatten-whitespace
// + 600-char clamp semantics, but driven off the real store shape
// (Map<seq, TranscriptItem> + an explicit order) instead of SeqItem[].
import type { TranscriptItem } from "@/ipc/bindings";

export interface ChatLine {
  seq: number;
  who: "user" | "bot" | "note";
  text: string;
  ts: number | null;
  /** Set on a locally-added user line that's standing in for the engine's
   *  own echo of the same send (store.ts's addLocalLine, use-chat-session.ts's
   *  merge) — never set on a transcript-derived line. */
  echo?: boolean;
}

const CHAT_LINE_CHARS = 600;

/** Exported so use-chat-session.ts's echo-dedupe compares local/transcript
 *  text under the exact same flatten+clamp rules as chatLinesFrom below. */
export function normalize(text: string): string | null {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > CHAT_LINE_CHARS ? `${flat.slice(0, CHAT_LINE_CHARS - 1)}…` : flat;
}

export function chatLinesFrom(items: Map<number, TranscriptItem>, order: number[]): ChatLine[] {
  const out: ChatLine[] = [];
  for (const seq of order) {
    const item = items.get(seq);
    if (!item) continue; // seq listed but not (yet) loaded — skip defensively

    let who: ChatLine["who"];
    if (item.kind === "UserText") who = "user";
    else if (item.kind === "AssistantText") who = "bot";
    else if (item.kind === "SystemNote") who = "note";
    else continue; // Thinking/ToolUse/ToolResult/Image/Usage/Checkpoint/Unknown

    const text = normalize(item.data.text);
    if (!text) continue;
    out.push({ seq, who, text, ts: item.data.ts });
  }
  return out;
}

/**
 * Interleave a chat's two line sources into one chronological list (local-
 * note ordering fix): `transcriptLines` and `localLines` are each already in
 * ascending-`ts` order on their own (seq order for the former, insertion
 * order — store.ts's addLocalLine stamps `Date.now()` at push time — for the
 * latter), so a single two-pointer merge produces the fully-interleaved,
 * ascending-`ts` result in O(n+m) without a full re-sort. Exactly-equal
 * timestamps are a real possibility (two events in the same millisecond) —
 * the `<=` below resolves every tie in the transcript line's favor, a
 * deterministic choice callers can rely on rather than an accident of sort
 * stability. A null `ts` (never actually produced today — every
 * TranscriptItem carries one and addLocalLine always stamps one — but still
 * part of ChatLine's type) sorts as if infinitely late, so a line that
 * somehow lacks a timestamp lands at the end instead of jumping the queue.
 */
export function mergeChatLines(transcriptLines: ChatLine[], localLines: ChatLine[]): ChatLine[] {
  const merged: ChatLine[] = [];
  let i = 0;
  let j = 0;
  while (i < transcriptLines.length && j < localLines.length) {
    const t = transcriptLines[i]!;
    const l = localLines[j]!;
    if ((t.ts ?? Infinity) <= (l.ts ?? Infinity)) {
      merged.push(t);
      i++;
    } else {
      merged.push(l);
      j++;
    }
  }
  while (i < transcriptLines.length) merged.push(transcriptLines[i++]!);
  while (j < localLines.length) merged.push(localLines[j++]!);
  return merged;
}
