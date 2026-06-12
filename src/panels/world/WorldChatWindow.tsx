// Floating in-world chat (EKI-118) — v1's beloved chat window, reborn: a
// draggable card hovering over the 3D world, minimizable to a chat bubble
// with an unread badge. Several can hover at once, messenger-style: windows
// stagger on open, bubbles line up bottom-right, clicking brings to front.
import { useEffect, useRef, useState } from "react";
import { Minus, Send, X } from "lucide-react";
import { StatusEmoji } from "@/components/StatusEmoji";
import { commands } from "@/ipc/bindings";
import type { WorldBot } from "./lib/bots";
import { statusGlow } from "./lib/status";
import { chatLine, useBotChat } from "./use-bot-chat";

/** Horizontal pitch between minimized bubbles (fixed-width, truncated). */
const BUBBLE_PITCH = 152;

export interface WorldChatWindowProps {
  bot: WorldBot;
  minimized: boolean;
  onMinimize: (min: boolean) => void;
  onClose: () => void;
  /** Slot among the minimized bubbles (0 = rightmost). */
  bubbleIndex?: number;
  /** Slot among all open chats — staggers the spawn position. */
  stagger?: number;
  /** Stacking order; the panel raises the last-touched window. */
  zIndex?: number;
  /** Header touched — bring this window to the front. */
  onFocus?: (() => void) | undefined;
}

export function WorldChatWindow({
  bot,
  minimized,
  onMinimize,
  onClose,
  bubbleIndex = 0,
  stagger = 0,
  zIndex = 20,
  onFocus,
}: WorldChatWindowProps) {
  const { lines, push } = useBotChat(bot);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Window position: top-left offset within the world panel; dragged via the
  // header. Staggered per open chat so windows never spawn on top of each
  // other; hovering left-of-center keeps the side panel visible.
  const [pos, setPos] = useState({ x: 24 + stagger * 36, y: 48 + stagger * 30 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Unread badge: lines that arrived after the minimize click.
  const [seenAtMinimize, setSeenAtMinimize] = useState(0);
  const unread = minimized ? Math.max(0, lines.length - seenAtMinimize) : 0;
  const minimize = () => {
    setSeenAtMinimize(lines.length);
    onMinimize(true);
  };

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, minimized]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    push(chatLine("user", text));
    void commands.sendToSession(bot.id, text).then((res) => {
      if (res.status === "error") setError(res.error);
    });
  };

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => onMinimize(false)}
        className="pointer-events-auto absolute bottom-10 z-20 flex w-36 items-center gap-2 rounded-full border bg-card/95 py-2 pl-3 pr-4 text-xs shadow-lg backdrop-blur hover:bg-card"
        style={{ right: 8 + bubbleIndex * BUBBLE_PITCH }}
        title={`Chat with ${bot.name}`}
      >
        <span className="relative text-base leading-none">
          💬
          {unread > 0 && (
            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
              {unread}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-medium">{bot.name}</span>
      </button>
    );
  }

  return (
    <div
      className="pointer-events-auto absolute flex max-h-[70%] w-96 flex-col rounded-xl border bg-card/95 shadow-xl backdrop-blur"
      style={{ left: pos.x, top: pos.y, zIndex }}
      onPointerDown={onFocus}
    >
      {/* Drag handle / header */}
      <div
        className="flex cursor-grab items-center gap-2 rounded-t-xl border-b bg-muted/40 px-3 py-2 active:cursor-grabbing"
        onPointerDown={(e) => {
          onFocus?.();
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos({
            x: Math.max(0, e.clientX - drag.current.dx),
            y: Math.max(0, e.clientY - drag.current.dy),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <StatusEmoji status={bot.status} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{bot.name}</div>
          <div className="truncate text-[10px] text-muted-foreground">{statusGlow(bot.status).label}</div>
        </div>
        <button
          type="button"
          aria-label="Minimize"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={minimize}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          aria-label="Close chat"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      {/* Conversation */}
      <div ref={scroller} className="flex min-h-32 flex-1 flex-col gap-1.5 overflow-y-auto p-3">
        {lines.length === 0 && (
          <p className="m-auto text-xs text-muted-foreground">Nothing said yet — say hi! 👋</p>
        )}
        {lines.map((l, i) => (
          <div
            key={i}
            className={
              l.who === "bot"
                ? "max-w-[85%] self-start rounded-xl rounded-bl-sm bg-muted px-2.5 py-1.5 text-xs leading-snug"
                : "max-w-[85%] self-end rounded-xl rounded-br-sm bg-primary px-2.5 py-1.5 text-xs leading-snug text-primary-foreground"
            }
          >
            {l.text}
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="flex gap-1.5 border-t p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // The world panel listens for F/E/Esc — typing must not reach it.
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") send();
          }}
          placeholder={`Message ${bot.name}…`}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary"
        />
        <button
          type="button"
          aria-label="Send"
          disabled={!draft.trim()}
          onClick={send}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
        >
          <Send size={13} />
        </button>
      </div>
      {error && <p className="px-3 pb-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
