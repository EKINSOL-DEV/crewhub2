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
}

const CHAT_LINE_CHARS = 600;

function normalize(text: string): string | null {
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
