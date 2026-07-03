// Diegetic chat window (M2 T3): a fixed, chunky game-styled card stacked
// bottom-right — HudOverlay's chip look (rounded, border-2, backdrop-blur),
// not the shadcn side-panel look, since this is world furniture, not a
// panel. Minimized state collapses to a round chip in the same stack.
// Reference only: src/panels/world/WorldChatWindow.tsx (v1's drag/resize
// panel window) — its bubble-alignment and composer semantics are echoed
// here, minus dragging/resizing/optimistic echo (see use-chat-session.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { isModelTierId } from "@/components/ModelPicker";
import { playSfx } from "@/game/audio/sfx";
import type { SessionStatus } from "@/ipc/bindings";
import { hireAgent } from "./hire";
import type { ChatLine } from "./lines";
import { PermissionCard } from "./PermissionCard";
import { QuestionCard } from "./QuestionCard";
import { useGameChats } from "./store";
import { parseSessionKey, useChatSession } from "./use-chat-session";

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
  /** `?demo` fake robot — no session behind it, so the composer is a dead end. */
  demo?: boolean;
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
  demo = false,
  onClose,
  onMinimize,
  onFocusChat,
}: ChatWindowProps) {
  const { lines, status, agent, pending, send } = useChatSession(chatKey);
  const sid = useMemo(() => parseSessionKey(chatKey), [chatKey]);
  const pendingCount = pending.permissions.length + pending.questions.length;
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Imperative scroll-to-bottom stays in an effect (react-compiler rule) —
  // never touched from render or the send handler directly.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const right = STACK_RIGHT + stackIndex * STACK_GAP;
  const ended = status === "Ended";
  // An Ended session with a bound crew agent can be woken back up (M4 debt
  // sweep, ported from the deleted world's WorldChatWindow.wakeAndSend) —
  // its composer stays live so the draft becomes the wake-up prompt. An
  // Ended session with no agent binding (e.g. a taken-over External
  // session) has no spawn path back, so it stays a dead end.
  const canWake = ended && agent !== null;
  const composerDisabled = (ended && !canWake) || demo;

  const submit = () => {
    const text = draft.trim();
    if (!text) return; // whitespace-only: leave the draft alone, don't send
    if (canWake) {
      void wakeUp(text);
      return;
    }
    setDraft("");
    setSendError(null);
    void send(text).then((res) => {
      if (res.ok) {
        playSfx("send");
        return;
      }
      setSendError(res.error);
      // Restore the eaten message — but only if the user hasn't started
      // typing something new in the meantime.
      setDraft((cur) => (cur === "" ? text : cur));
    });
  };

  // Port of WorldChatWindow.wakeAndSend (src/panels/world/WorldChatWindow.tsx,
  // deleted M4 T6): spawn a fresh session for the bound agent with the draft
  // as its first prompt, bind it, then swap this window onto the new chat
  // key. The engine echoes the prompt into the fresh transcript itself (see
  // use-chat-session.ts) — no seed line to thread through, unlike v1.
  const wakeUp = async (text: string) => {
    if (!agent) return;
    setDraft("");
    setSendError(null);
    const model = isModelTierId(agent.default_model) ? agent.default_model : "sonnet";
    const result = await hireAgent(agent, { model, prompt: text });
    if ("error" in result) {
      setSendError(result.error);
      setDraft((cur) => (cur === "" ? text : cur));
      return;
    }
    playSfx("hire");
    useGameChats.getState().close(chatKey);
    useGameChats.getState().open(result.key);
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
        {pendingCount > 0 && (
          <span
            aria-hidden="true"
            data-testid="chat-chip-ping"
            className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-red-500"
          />
        )}
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
        {demo ? (
          <div
            data-testid="chat-window-demo-note"
            className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500"
          >
            demo thread — hire a real robot to chat
          </div>
        ) : (
          lines.map((l) => lineBubble(l, color))
        )}
      </div>

      {pendingCount > 0 && (
        <div className="max-h-52 shrink-0 space-y-1.5 overflow-y-auto border-t-2 border-slate-900/10 px-3 py-2">
          {pending.permissions.map((req) => (
            <PermissionCard key={req.request_id} sid={sid} name={name} color={color} req={req} />
          ))}
          {pending.questions.map((req) => (
            <QuestionCard key={req.request_id} sid={sid} name={name} color={color} req={req} />
          ))}
        </div>
      )}

      {sendError && (
        <div data-testid="chat-window-error" className="px-3 pt-1 text-xs text-red-500">
          {sendError}
        </div>
      )}

      <div className="flex gap-2 border-t-2 border-slate-900/10 p-2">
        <input
          data-testid="chat-window-input"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (sendError) setSendError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          disabled={composerDisabled}
          placeholder={
            demo
              ? "demo thread"
              : canWake
                ? `Wake ${name} with…`
                : ended
                  ? "session ended"
                  : `Message ${name}…`
          }
          className="h-9 min-w-0 flex-1 rounded-full border-2 border-slate-900/10 bg-white px-3 text-sm outline-none disabled:opacity-50"
        />
        {canWake ? (
          <Button data-testid="chat-window-wake" onClick={submit} disabled={!draft.trim()}>
            ⏰ Wake up
          </Button>
        ) : (
          <Button data-testid="chat-window-send" onClick={submit} disabled={composerDisabled}>
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
