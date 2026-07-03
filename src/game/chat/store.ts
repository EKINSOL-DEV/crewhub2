// Open-chats registry (M2 T1): which bots have a chat window open, and which
// are minimized to bubbles. Port of use-world-chats.ts, minus the seed-line
// concept (real transcripts replace it) — plus a 3-window cap, since the
// world can now open many bots' chats: opening a 4th closes the oldest.
// Array order = stacking order (last = on top).
import { create } from "zustand";
import { commands } from "@/ipc/bindings";
import { playSfx } from "@/game/audio/sfx";
import type { ChatLine } from "./lines";
import { clampLayout, type Point, type Size } from "./window-clamp";

export interface OpenChat {
  key: string;
  min: boolean;
}

/** A chat window's remembered drag position and/or resized size (EKI resize
 *  follow-up) — either half may be null: a window that's only ever been
 *  dragged has a size-only-null entry, one only ever resized has a
 *  pos-only-null entry, and one dragged AND resized has both. Null pos keeps
 *  the window in the default bottom-right stack (STACK_RIGHT/STACK_GAP math
 *  in ChatWindow.tsx); null size keeps its default 350×440 box
 *  (window-clamp.ts's DEFAULT_SIZE). Lives in its own map, keyed by chat key
 *  and independent of `chats` (the open/minimized registry) — closing and
 *  reopening a chat, or restarting the app entirely, never loses it. */
export interface ChatLayout {
  pos: Point | null;
  size: Size | null;
}

const EMPTY_LAYOUT: ChatLayout = { pos: null, size: null };

export const GAME_CHAT_LAYOUT_KEY = "game.chat.layout";
const PERSIST_DEBOUNCE_MS = 500;

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

/** Raw shape persisted to the settings KV — a flat, mostly-optional record
 *  per key (x/y for pos, w/h for size; either pair may be absent) rather
 *  than nested {pos,size} objects, so a size-only or pos-only entry never
 *  has to carry an explicit `null` through JSON. */
interface PersistedEntry {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

function toPersistedEntry(layout: ChatLayout): PersistedEntry | null {
  if (!layout.pos && !layout.size) return null;
  return {
    ...(layout.pos ? { x: layout.pos.x, y: layout.pos.y } : {}),
    ...(layout.size ? { w: layout.size.w, h: layout.size.h } : {}),
  };
}

/** Defensive parse of the persisted layout blob: junk JSON, a non-object
 *  root, or a per-key entry with the wrong shape all fall back to "nothing
 *  for this key" rather than throwing — a corrupt/stale blob must never
 *  crash chat on load. Every recovered entry is clamped immediately (EKI
 *  resize follow-up's "oversized persisted layout clamps on load") since
 *  it may have been written on a larger screen in an earlier session. */
function parseLayoutBlob(raw: string | null | undefined): Record<string, ChatLayout> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, ChatLayout> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const e = value as Record<string, unknown>;
    const pos = typeof e.x === "number" && typeof e.y === "number" ? { x: e.x, y: e.y } : null;
    const size = typeof e.w === "number" && typeof e.h === "number" ? { w: e.w, h: e.h } : null;
    if (!pos && !size) continue;
    out[key] = clampLayout({ pos, size });
  }
  return out;
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
  /** Per-chat drag position + resized size (EKI resize follow-up), persisted
   *  to the settings KV — see ChatLayout's doc comment. */
  layout: Record<string, ChatLayout>;
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
  setPos: (key: string, pos: Point | null) => void;
  /** Set a window's resized size. */
  setSize: (key: string, size: Size) => void;
  /** Load the persisted layout map from the settings KV — fetches at most
   *  once per app run (see the module-level guard below), merging over
   *  whatever's already in `layout` rather than replacing it, so a drag/
   *  resize that lands in the race window before this resolves is never
   *  clobbered by the (now-stale) fetch. */
  loadLayout: () => Promise<void>;
}

let layoutRequested = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersistLayout(get: () => GameChatsState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const toPersist: Record<string, PersistedEntry> = {};
    for (const [key, entry] of Object.entries(get().layout)) {
      const persisted = toPersistedEntry(entry);
      if (persisted) toPersist[key] = persisted;
    }
    void commands.setSetting(GAME_CHAT_LAYOUT_KEY, JSON.stringify(toPersist)).catch(() => undefined);
  }, PERSIST_DEBOUNCE_MS);
}

export const useGameChats = create<GameChatsState>((set, get) => ({
  chats: [],
  localLines: {},
  layout: {},
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
      // must not touch its layout — pos/size live in the independent
      // `layout` map now (EKI resize follow-up), untouched by `chats`
      // membership at all.
      const rest = s.chats.filter((c) => c.key !== key);
      const kept = rest.length < MAX_OPEN ? rest : rest.slice(rest.length - (MAX_OPEN - 1));
      return { chats: [...kept, { key, min: false }] };
    });
  },
  setPos: (key, pos) => {
    set((s) => ({ layout: { ...s.layout, [key]: { ...(s.layout[key] ?? EMPTY_LAYOUT), pos } } }));
    schedulePersistLayout(get);
  },
  setSize: (key, size) => {
    set((s) => ({ layout: { ...s.layout, [key]: { ...(s.layout[key] ?? EMPTY_LAYOUT), size } } }));
    schedulePersistLayout(get);
  },
  raise: (key) =>
    set((s) => {
      if (s.chats[s.chats.length - 1]?.key === key) return s;
      const me = s.chats.find((c) => c.key === key);
      return me ? { chats: [...s.chats.filter((c) => c.key !== key), me] } : s;
    }),
  setMin: (key, min) => set((s) => ({ chats: s.chats.map((c) => (c.key === key ? { ...c, min } : c)) })),
  close: (key) => set((s) => ({ chats: s.chats.filter((c) => c.key !== key) })),
  loadLayout: async () => {
    if (layoutRequested) return;
    layoutRequested = true;
    try {
      const res = await commands.getSetting(GAME_CHAT_LAYOUT_KEY);
      const loaded = res.status === "ok" ? parseLayoutBlob(res.data) : {};
      // In-session values win over the fetch — guards the (rare) race where
      // a drag/resize commits before this promise resolves.
      set((s) => ({ layout: { ...loaded, ...s.layout } }));
    } catch {
      // backend unavailable (unit tests, plain browser) — keep whatever's
      // already in `layout` (nothing, on a cold start).
    }
  },
}));

/** Test hook: reset every piece of module-level state this store carries,
 *  including the debounced-persist timer and the single-fetch `loadLayout`
 *  guard — mirrors quality.ts/workspace.ts's reset-for-tests convention. */
export function resetGameChatsForTests(): void {
  layoutRequested = false;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  useGameChats.setState({ chats: [], localLines: {}, layout: {} });
}
