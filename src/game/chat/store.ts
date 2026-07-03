// Open-chats registry (M2 T1): which bots have a chat window open, and which
// are minimized to bubbles. Port of use-world-chats.ts, minus the seed-line
// concept (real transcripts replace it) — plus a 3-window cap, since the
// world can now open many bots' chats: opening a 4th closes the oldest.
// Array order = stacking order (last = on top).
import { create } from "zustand";
import { playSfx } from "@/game/audio/sfx";

export interface OpenChat {
  key: string;
  min: boolean;
}

const MAX_OPEN = 3;

interface GameChatsState {
  chats: OpenChat[];
  /** Open (or un-minimize and raise) the chat for this bot. */
  open: (key: string) => void;
  close: (key: string) => void;
  setMin: (key: string, min: boolean) => void;
  /** Raise to the top of the stack without changing minimized state. */
  raise: (key: string) => void;
}

export const useGameChats = create<GameChatsState>((set) => ({
  chats: [],
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
