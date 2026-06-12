// Floating-chat registry (EKI-119): which bots have a chat window open, and
// which are minimized to bubbles. Module-level store — open conversations
// must survive panel remounts and view switches (board click → workspace →
// back), which WorldPanel-local state did not. Array order = stacking order
// (last = on top).
import { create } from "zustand";
import type { ChatLine } from "./use-bot-chat";

export interface WorldChat {
  key: string;
  min: boolean;
  /** One line to show immediately on mount (EKI-123): carries the user's
   *  wake message across the crew→session re-key, where the window remounts
   *  before the engine has echoed the prompt into the transcript. */
  seed?: ChatLine;
}

interface WorldChatsState {
  chats: WorldChat[];
  /** Open (or un-minimize and raise) the chat for this bot. */
  open: (key: string, seed?: ChatLine) => void;
  /** Take (and clear) the seed line — called once by the window on mount. */
  takeSeed: (key: string) => ChatLine | null;
  /** Raise to the top of the stack without changing minimized state. */
  raise: (key: string) => void;
  setMin: (key: string, min: boolean) => void;
  close: (key: string) => void;
}

export const useWorldChats = create<WorldChatsState>((set, get) => ({
  chats: [],
  open: (key, seed) =>
    set((s) => ({
      chats: [
        ...s.chats.filter((c) => c.key !== key),
        seed ? { key, min: false, seed } : { key, min: false },
      ],
    })),
  takeSeed: (key) => {
    const seed = get().chats.find((c) => c.key === key)?.seed ?? null;
    if (seed) set((s) => ({ chats: s.chats.map((c) => (c.key === key ? { key: c.key, min: c.min } : c)) }));
    return seed;
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
