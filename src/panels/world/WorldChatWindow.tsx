// Floating in-world chat (EKI-118) — v1's beloved chat window, reborn: a
// draggable card hovering over the 3D world, minimizable to a chat bubble
// with an unread badge. Several can hover at once, messenger-style: windows
// stagger on open, bubbles line up bottom-right, clicking brings to front.
import { useEffect, useRef, useState } from "react";
import { Minus, Scaling, Send, X } from "lucide-react";
import { StatusEmoji } from "@/components/StatusEmoji";
import { commands } from "@/ipc/bindings";
import { agentSpawnSpec } from "@/panels/crew/crew-status";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useProjectsStore } from "@/stores/projects";
import { sessionKey } from "@/stores/sessions";
import type { WorldBot } from "./lib/bots";
import { LOBBY_ID } from "./lib/layout";
import { statusGlow } from "./lib/status";
import { chatLine, useBotChat } from "./use-bot-chat";
import { useWorldChats } from "./use-world-chats";

/** Vertical pitch between minimized bubbles on the left edge (EKI-123). */
const BUBBLE_PITCH = 52;

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
  // Resizable (EKI-123): corner grip adjusts both axes, clamped sane.
  const [size, setSize] = useState({ w: 384, h: 440 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const resize = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // A seed line carries the user's wake message across the crew→session
  // re-key (EKI-123) — consume it exactly once on mount.
  useEffect(() => {
    const seed = useWorldChats.getState().takeSeed(bot.key);
    if (seed) push(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);
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

  // Crew bots have no session yet (EKI-122): the FIRST message wakes them —
  // spawn with the text as the prompt (home project, else the room's project)
  // and re-key this chat onto the fresh session.
  const wakeAndSend = async (text: string) => {
    const agent = useAgentsStore.getState().agents.find((a) => a.id === bot.agentId);
    if (!agent) {
      setError("This crew member is gone — check the crew panel.");
      return;
    }
    const room = useBindingsStore.getState().rooms.find((r) => r.id === bot.roomId) ?? null;
    const roomProject = room?.project_id
      ? (useProjectsStore.getState().projects.find((p) => p.id === room.project_id) ?? null)
      : null;
    const effective =
      agent.project_path || !roomProject ? agent : { ...agent, project_path: roomProject.folder_path };
    const spec = agentSpawnSpec(effective);
    if ("error" in spec) {
      setError(`${spec.error} (Manage crew → ✏️)`);
      return;
    }
    const provider = await useAgentsStore.getState().getSpawnProvider();
    if (!provider) {
      setError("No spawn-capable provider is available — is the engine running?");
      return;
    }
    const res = await commands.spawnSession(provider, { ...spec, prompt: text });
    if (res.status === "error") {
      setError(res.error);
      return;
    }
    await useBindingsStore.getState().upsert({
      session_id: res.data.id,
      agent_id: agent.id,
      room_id: bot.roomId === LOBBY_ID ? null : bot.roomId,
      display_name: null,
      pinned: false,
    });
    const fresh = sessionKey(res.data);
    useWorldChats.getState().close(bot.key);
    // Seed the re-keyed window with the message that woke them — the engine
    // echo lands later and dedupes against it.
    useWorldChats.getState().open(fresh, chatLine("user", text) ?? undefined);
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    if (bot.agentId) {
      push(chatLine("user", text));
      void wakeAndSend(text);
      return;
    }
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
        className="pointer-events-auto absolute z-20 flex w-40 items-center gap-2 rounded-full border bg-card/90 py-2 pl-3 pr-4 text-xs shadow-lg backdrop-blur transition-transform hover:scale-105 hover:bg-card"
        style={{ left: 12, bottom: 96 + bubbleIndex * BUBBLE_PITCH }}
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
      className="pointer-events-auto absolute flex max-h-[85vh] select-none flex-col rounded-xl border bg-card/95 shadow-xl backdrop-blur"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex }}
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
          <p className="m-auto px-6 text-center text-xs text-muted-foreground">
            {bot.agentId
              ? `💤 ${bot.name} is resting — your first message wakes them up.`
              : "Nothing said yet — say hi! 👋"}
          </p>
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

      {/* Corner grip — drag to resize (EKI-123). */}
      <div
        role="presentation"
        aria-label="Resize chat"
        className="absolute -bottom-1 -right-1 flex h-5 w-5 cursor-nwse-resize items-center justify-center text-muted-foreground/60 hover:text-foreground"
        onPointerDown={(e) => {
          e.stopPropagation();
          resize.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!resize.current) return;
          setSize({
            w: Math.min(720, Math.max(300, resize.current.w + (e.clientX - resize.current.x))),
            h: Math.min(820, Math.max(260, resize.current.h + (e.clientY - resize.current.y))),
          });
        }}
        onPointerUp={() => {
          resize.current = null;
        }}
      >
        <Scaling size={11} />
      </div>
    </div>
  );
}
