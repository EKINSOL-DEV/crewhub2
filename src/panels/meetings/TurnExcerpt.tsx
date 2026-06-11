// On-demand turn content (D-M4-2's no-copy rule, UI side): turn text is NEVER
// stored — it's read back through the provider transcript at the persisted
// `transcript_offset`, and "open in chat" deep-links the chat panel at that
// same seq anchor (one numbering, M2 D-M2-3).
//
// Mount with `key={turn.id}` — state is per-turn by remount, not by reset.
import { useEffect, useState } from "react";
import { openChatPanel } from "@/app/open-chat";
import { commands, type MeetingTurn, type SeqItem, type SessionId } from "@/ipc/bindings";

const EXCERPT_CHAR_CAP = 700;
const EXCERPT_PAGE = 60;

/** Pure: fold a transcript page into the turn's display excerpt (text items only). */
export function excerptFromItems(items: SeqItem[]): string {
  const parts: string[] = [];
  for (const { item } of items) {
    if (item.kind === "AssistantText" || item.kind === "UserText") parts.push(item.data.text);
  }
  const joined = parts.join("\n\n").trim();
  if (joined.length <= EXCERPT_CHAR_CAP) return joined;
  return `${joined.slice(0, EXCERPT_CHAR_CAP)}… [truncated]`;
}

type ExcerptState = { kind: "loading" } | { kind: "ok"; text: string } | { kind: "failed" };

export interface TurnExcerptProps {
  turn: MeetingTurn;
  session: SessionId | null;
  /** Terminal meetings open the read-only chat (EKI-60). */
  historyMode: boolean;
}

export function TurnExcerpt({ turn, session, historyMode }: TurnExcerptProps) {
  const [state, setState] = useState<ExcerptState>({ kind: "loading" });
  const provider = session?.provider ?? null;
  const rawId = session?.id ?? null;
  const offset = turn.transcript_offset ?? 0;

  useEffect(() => {
    if (provider === null || rawId === null) return;
    let live = true;
    commands
      .getSessionTranscript({ provider, id: rawId }, offset, EXCERPT_PAGE)
      .then((res) => {
        if (!live) return;
        if (res.status === "ok") setState({ kind: "ok", text: excerptFromItems(res.data.items) });
        else setState({ kind: "failed" });
      })
      .catch(() => {
        if (live) setState({ kind: "failed" });
      });
    return () => {
      live = false;
    };
  }, [provider, rawId, offset]);

  const failed = session === null || state.kind === "failed";

  return (
    <div data-testid={`turn-excerpt-${turn.id}`} className="rounded border bg-muted/30 px-2 py-1.5 text-xs">
      {failed && <p className="text-muted-foreground">📼 transcript unavailable — the session may be gone</p>}
      {!failed && state.kind === "loading" && <p className="text-muted-foreground">reading transcript…</p>}
      {!failed && state.kind === "ok" && (
        <p className="whitespace-pre-wrap">{state.text.length > 0 ? state.text : "(nothing said yet)"}</p>
      )}
      {session && (
        <button
          type="button"
          data-testid={`turn-open-chat-${turn.id}`}
          className="mt-1 text-[10px] text-muted-foreground underline hover:text-foreground"
          onClick={() =>
            openChatPanel({
              provider: session.provider,
              id: session.id,
              mode: historyMode ? "history" : "live",
              seq: offset,
            })
          }
        >
          open in chat ↗
        </button>
      )}
    </div>
  );
}
