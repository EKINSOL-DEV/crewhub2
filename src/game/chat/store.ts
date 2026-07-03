// Open-chats registry (M2 T1): which bots have a chat window open, and which
// are minimized to bubbles. Port of use-world-chats.ts, minus the seed-line
// concept (real transcripts replace it) — plus a 3-window cap, since the
// world can now open many bots' chats: opening a 4th closes the oldest.
// Array order = stacking order (last = on top).
import { create } from "zustand";
import { playSfx } from "@/game/audio/sfx";
import type { ChatLine } from "./lines";

export interface OpenChat {
  key: string;
  min: boolean;
  /** Drag position (M8 T-drag): null keeps the window in the default
   *  bottom-right stack (STACK_RIGHT/STACK_GAP math in ChatWindow.tsx); once
   *  dragged it holds an absolute {x,y} and leaves the stack, so the
   *  remaining null-pos windows compact together (ChatWindows.tsx assigns
   *  stackIndex only among null-pos windows). Session-only — never persisted
   *  to KV, so a restart resets every window back to its stack slot; that's
   *  an accepted trade-off, not an oversight.
   */
  pos: { x: number; y: number } | null;
}

const MAX_OPEN = 3;
/** Per-chat local-line cap (review follow-up) — a long-running demo bot or a
 *  chatty session-less crew member can otherwise grow this unboundedly since
 *  nothing else ever prunes it (see the doc comment below). Oldest lines
 *  drop first, same "keep the newest" spirit as MAX_OPEN above. */
const LOCAL_LINES_MAX = 200;

// M7 T3: synthetic seqs for locally-added lines, strictly decreasing so they
// can never collide with a real (always >= 0) transcript seq.
let localLineCounter = 0;
function nextLocalSeq(): number {
  localLineCounter -= 1;
  return localLineCounter;
}

interface GameChatsState {
  chats: OpenChat[];
  /**
   * Per-chat overlay of note/bot lines that never touch the engine-backed
   * transcripts store (M7 T3) — say-intent replies and command feedback for
   * demo bots and session-less crew, neither of which has a real transcript
   * to write into. use-chat-session.ts merges these AFTER a chat's
   * transcript lines, in the order they were added: they're always the
   * newest thing that happened, so appending (rather than sorting by the
   * synthetic seq) is both correct and cheaper. Kept across chat close/
   * reopen — losing "on my way!" feedback the moment a window closes would
   * be a surprising, and the data's tiny — capped at LOCAL_LINES_MAX per
   * key (oldest dropped first) rather than pruned outright, so a
   * long-lived chat can't grow this without bound.
   */
  localLines: Record<string, ChatLine[]>;
  /** Open (or un-minimize and raise) the chat for this bot. */
  open: (key: string) => void;
  close: (key: string) => void;
  setMin: (key: string, min: boolean) => void;
  /** Raise to the top of the stack without changing minimized state. */
  raise: (key: string) => void;
  /** `opts.echo` marks a "user" line as the instant-send stand-in for the
   *  engine's own transcript echo (use-chat-session.ts dedupes it once that
   *  echo lands) — never set for "note"/"bot" lines. */
  addLocalLine: (key: string, who: "note" | "bot" | "user", text: string, opts?: { echo?: boolean }) => void;
  /** Set (or clear, with null) a window's drag position. */
  setPos: (key: string, pos: { x: number; y: number } | null) => void;
}

export const useGameChats = create<GameChatsState>((set) => ({
  chats: [],
  localLines: {},
  addLocalLine: (key, who, text, opts) =>
    set((s) => {
      const next = [
        ...(s.localLines[key] ?? []),
        // exactOptionalPropertyTypes: only include `echo` at all when true,
        // rather than assigning `opts?.echo` (which would widen it to
        // `boolean | undefined` on the object literal itself).
        { seq: nextLocalSeq(), who, text, ts: Date.now(), ...(opts?.echo ? { echo: true } : {}) },
      ];
      return {
        localLines: {
          ...s.localLines,
          [key]: next.length > LOCAL_LINES_MAX ? next.slice(next.length - LOCAL_LINES_MAX) : next,
        },
      };
    }),
  open: (key) => {
    playSfx("chat-open");
    set((s) => {
      // Re-opening a chat that's already in the stack (un-minimize + raise)
      // must not snap a dragged window back to its stack slot — carry its
      // pos across, same as raise()/setMin() already do implicitly via spread.
      const existingPos = s.chats.find((c) => c.key === key)?.pos ?? null;
      const rest = s.chats.filter((c) => c.key !== key);
      const kept = rest.length < MAX_OPEN ? rest : rest.slice(rest.length - (MAX_OPEN - 1));
      return { chats: [...kept, { key, min: false, pos: existingPos }] };
    });
  },
  setPos: (key, pos) => set((s) => ({ chats: s.chats.map((c) => (c.key === key ? { ...c, pos } : c)) })),
  raise: (key) =>
    set((s) => {
      if (s.chats[s.chats.length - 1]?.key === key) return s;
      const me = s.chats.find((c) => c.key === key);
      return me ? { chats: [...s.chats.filter((c) => c.key !== key), me] } : s;
    }),
  setMin: (key, min) => set((s) => ({ chats: s.chats.map((c) => (c.key === key ? { ...c, min } : c)) })),
  close: (key) => set((s) => ({ chats: s.chats.filter((c) => c.key !== key) })),
}));
