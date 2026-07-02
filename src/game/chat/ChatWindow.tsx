// Diegetic chat window (M2 T3): a fixed, chunky game-styled card stacked
// bottom-right — HudOverlay's chip look (rounded, border-2, backdrop-blur),
// not the shadcn side-panel look, since this is world furniture, not a
// panel. Minimized state collapses to a round chip in the same stack.
// Reference only: src/panels/world/WorldChatWindow.tsx (v1's drag/resize
// panel window) — its bubble-alignment and composer semantics are echoed
// here, minus dragging/resizing/optimistic echo (see use-chat-session.ts).
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SessionStatus } from "@/ipc/bindings";
import type { ChatLine } from "./lines";
import { useChatSession } from "./use-chat-session";

const STATUS_GLYPH: Record<SessionStatus, string> = {
  Working: "🟢",
  WaitingForPermission: "🔴",
  WaitingForInput: "🟠",
  Idle: "⚪",
  Ended: "⚪",
};

const STACK_RIGHT = 16;
const STACK_GAP = 370;

export interface ChatWindowProps {
  chatKey: string;
  name: string;
  color: string;
  minimized: boolean;
  /** Position in the open stack — 0 sits at the edge, higher pushes left. */
  stackIndex: number;
  onClose: () => void;
  onMinimize: (min: boolean) => void;
  onFocusChat: () => void;
}

function lineBubble(line: ChatLine, color: string) {
  if (line.who === "note") {
    return (
      <div
        key={line.seq}
        data-who="note"
        className="mx-auto max-w-[85%] text-center text-[11px] text-slate-500"
      >
        {line.text}
      </div>
    );
  }
  if (line.who === "user") {
    return (
      <div
        key={line.seq}
        data-who="user"
        className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm px-3 py-1.5 text-sm text-slate-900"
        style={{ backgroundColor: `${color}33` }}
      >
        {line.text}
      </div>
    );
  }
  return (
    <div
      key={line.seq}
      data-who="bot"
      className="mr-auto max-w-[80%] rounded-2xl rounded-bl-sm border border-slate-900/10 bg-white px-3 py-1.5 text-sm text-slate-900"
    >
      {line.text}
    </div>
  );
}

export function ChatWindow({
  chatKey,
  name,
  color,
  minimized,
  stackIndex,
  onClose,
  onMinimize,
  onFocusChat,
}: ChatWindowProps) {
  const { lines, status, send } = useChatSession(chatKey);
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  // Imperative scroll-to-bottom stays in an effect (react-compiler rule) —
  // never touched from render or the send handler directly.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const right = STACK_RIGHT + stackIndex * STACK_GAP;
  const ended = status === "Ended";

  const submit = () => {
    const text = draft;
    setDraft("");
    void send(text);
  };

  if (minimized) {
    return (
      <button
        type="button"
        aria-label={`Open chat with ${name}`}
        onClick={() => {
          onMinimize(false);
          onFocusChat();
        }}
        className="pointer-events-auto absolute bottom-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/60 text-lg font-bold text-white shadow-xl backdrop-blur transition-transform hover:scale-105"
        style={{ right, backgroundColor: color }}
      >
        {name.charAt(0).toUpperCase()}
      </button>
    );
  }

  return (
    <div
      data-testid="chat-window"
      className="pointer-events-auto absolute bottom-4 flex h-[440px] w-[350px] flex-col rounded-3xl border-2 border-white/60 bg-white/90 text-slate-900 shadow-2xl backdrop-blur"
      style={{ right }}
      onPointerDown={onFocusChat}
    >
      <div className="flex items-center gap-2 rounded-t-3xl border-b-2 border-slate-900/10 px-4 py-3">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1 truncate font-bold">{name}</span>
        <span title={status ?? "Idle"}>{STATUS_GLYPH[status ?? "Idle"]}</span>
        <button
          type="button"
          aria-label="Minimize"
          className="rounded-full px-1.5 py-0.5 font-bold hover:bg-slate-900/10"
          onClick={() => onMinimize(true)}
        >
          –
        </button>
        <button
          type="button"
          aria-label="Close"
          className="rounded-full px-1.5 py-0.5 font-bold hover:bg-slate-900/10"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {lines.map((l) => lineBubble(l, color))}
      </div>

      <div className="flex gap-2 border-t-2 border-slate-900/10 p-2">
        <input
          data-testid="chat-window-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          disabled={ended}
          placeholder={ended ? "session ended" : `Message ${name}…`}
          className="h-9 min-w-0 flex-1 rounded-full border-2 border-slate-900/10 bg-white px-3 text-sm outline-none disabled:opacity-50"
        />
        <Button data-testid="chat-window-send" onClick={submit} disabled={ended}>
          Send
        </Button>
      </div>
    </div>
  );
}
