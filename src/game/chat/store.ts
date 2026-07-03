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
}

const MAX_OPEN = 3;

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
   * be a surprising, and the data's tiny, so there's no reason to prune it.
   */
  localLines: Record<string, ChatLine[]>;
  /** Open (or un-minimize and raise) the chat for this bot. */
  open: (key: string) => void;
  close: (key: string) => void;
  setMin: (key: string, min: boolean) => void;
  /** Raise to the top of the stack without changing minimized state. */
  raise: (key: string) => void;
  addLocalLine: (key: string, who: "note" | "bot", text: string) => void;
}

export const useGameChats = create<GameChatsState>((set) => ({
  chats: [],
  localLines: {},
  addLocalLine: (key, who, text) =>
    set((s) => ({
      localLines: {
        ...s.localLines,
        [key]: [...(s.localLines[key] ?? []), { seq: nextLocalSeq(), who, text, ts: Date.now() }],
      },
    })),
  open: (key) => {
    playSfx("chat-open");
    set((s) => {
      const rest = s.chats.filter((c) => c.key !== key);
      const kept = rest.length < MAX_OPEN ? rest : rest.slice(rest.length - (MAX_OPEN - 1));
      return { chats: [...kept, { key, min: false }] };
    });
  },
  raise: (key) =>
    set((s) => {
      if (s.chats[s.chats.length - 1]?.key === key) return s;
      const me = s.chats.find((c) => c.key === key);
      return me ? { chats: [...s.chats.filter((c) => c.key !== key), me] } : s;
    }),
  setMin: (key, min) => set((s) => ({ chats: s.chats.map((c) => (c.key === key ? { ...c, min } : c)) })),
  close: (key) => set((s) => ({ chats: s.chats.filter((c) => c.key !== key) })),
}));
