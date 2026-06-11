// Command palette store (EKI-16): an extensible action registry — panels,
// themes, layout presets, projects, spawn… all register here; M3+ panels add
// sources without touching the palette. Pure filter/rank functions first.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";

export interface PaletteAction {
  id: string;
  label: string;
  emoji?: string;
  group: string;
  keywords: string[];
  hint?: string;
  run: () => void | Promise<void>;
}

const RECENTS_KEY = "palette.recents";
const MAX_RECENTS = 8;

// ── Pure: fuzzy filtering & ranking ──────────────────────────────────────────

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) if (ch === needle[i]) i++;
  return i === needle.length;
}

/** Score one action against one lowercase query token. -1 = no match. */
export function scoreToken(a: PaletteAction, token: string): number {
  const label = a.label.toLowerCase();
  if (label.startsWith(token)) return 100;
  if (label.includes(token)) return 80;
  if (a.keywords.some((k) => k.toLowerCase().startsWith(token))) return 60;
  if (a.keywords.some((k) => k.toLowerCase().includes(token))) return 50;
  if (token.length >= 2 && isSubsequence(token, label)) return 30;
  return -1;
}

/**
 * Fuzzy search across label + keywords: every whitespace-separated token must
 * match; recents get a small boost so habits float up.
 */
export function filterActions(
  actions: PaletteAction[],
  query: string,
  recents: string[] = [],
): PaletteAction[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return rankActions(actions, recents);
  return actions
    .map((a) => {
      let score = 0;
      for (const t of tokens) {
        const s = scoreToken(a, t);
        if (s < 0) return { a, score: -1 };
        score += s;
      }
      if (recents.includes(a.id)) score += 10;
      return { a, score };
    })
    .filter((x) => x.score >= 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

/** Empty-query order: recent actions first (most recent first), rest stable. */
export function rankActions(actions: PaletteAction[], recents: string[]): PaletteAction[] {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const top = recents.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const rest = actions.filter((a) => !recents.includes(a.id));
  return [...top, ...rest];
}

// ── Palette wink (D-M2-6): rotating empty-query footer hints ─────────────────

export const WINK_HINTS: readonly string[] = [
  "try: spawn a scout 🔭",
  "try: switch theme 🎨",
  "psst — ⌘1…9 jumps between panels",
  "try: cockpit preset 🛩️",
  "double-click a tab to rename it ✏️",
];

export function winkHint(n: number): string {
  return WINK_HINTS[((n % WINK_HINTS.length) + WINK_HINTS.length) % WINK_HINTS.length]!;
}

// ── Store ────────────────────────────────────────────────────────────────────

interface PaletteState {
  open: boolean;
  openCount: number; // drives the rotating wink
  sources: Record<string, PaletteAction[]>;
  recents: string[];
  spawnDialogOpen: boolean;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  setSpawnDialogOpen: (open: boolean) => void;
  registerActions: (sourceId: string, actions: PaletteAction[]) => () => void;
  unregisterActions: (sourceId: string) => void;
  allActions: () => PaletteAction[];
  load: () => Promise<void>;
  recordRun: (id: string) => void;
}

export const usePalette = create<PaletteState>((set, get) => ({
  open: false,
  openCount: 0,
  sources: {},
  recents: [],
  spawnDialogOpen: false,

  setOpen: (open) => set({ open, openCount: open ? get().openCount + 1 : get().openCount }),
  toggle: () => get().setOpen(!get().open),
  setSpawnDialogOpen: (spawnDialogOpen) => set({ spawnDialogOpen }),

  registerActions: (sourceId, actions) => {
    set({ sources: { ...get().sources, [sourceId]: actions } });
    return () => get().unregisterActions(sourceId);
  },

  unregisterActions: (sourceId) => {
    const next = { ...get().sources };
    delete next[sourceId];
    set({ sources: next });
  },

  allActions: () => Object.values(get().sources).flat(),

  load: async () => {
    try {
      const res = await commands.getSetting(RECENTS_KEY);
      if (res.status === "ok" && res.data) {
        const v: unknown = JSON.parse(res.data);
        if (Array.isArray(v) && v.every((x) => typeof x === "string")) set({ recents: v });
      }
    } catch {
      // best-effort: no recents
    }
  },

  recordRun: (id) => {
    const recents = [id, ...get().recents.filter((r) => r !== id)].slice(0, MAX_RECENTS);
    set({ recents });
    void commands.setSetting(RECENTS_KEY, JSON.stringify(recents)).catch(() => undefined);
  },
}));

/** Test-only reset. */
export function resetPaletteForTests() {
  usePalette.setState({
    open: false,
    openCount: 0,
    sources: {},
    recents: [],
    spawnDialogOpen: false,
  });
}
