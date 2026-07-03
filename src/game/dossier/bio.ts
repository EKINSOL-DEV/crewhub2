// Dossier bio engine (M9 T1) — a KV-cached, Haiku-generated 2-sentence bio
// per bot. Mirrors the flavor engine's shape (src/game/flavor/engine.ts:
// getSetting-then-generate, sanitize, silent failure) but persists its
// result in the settings KV instead of regenerating every cooldown window —
// a bio is a one-time flourish, not a recurring thought bubble.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";
import { bumpFlavorRuns, flavorEnabled, flavorModel } from "@/game/flavor/engine";
import type { DossierInfo } from "./data";

export const BIO_KEY_PREFIX = "game.bio.";

const MAX_NAME_LEN = 60;
const MAX_ROLE_LEN = 200;
const MAX_BIO_LEN = 240;

/** Shown (in-memory only, never persisted to KV) while flavor generation is switched off. */
export const BIO_DISABLED_PLACEHOLDER = "Flavor text is off, so this one's a mystery for now.";

function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

/** "Write a playful 2-sentence bio for <name>, a robot on a software campus. Personality hints: <role>; works on <project>. <=40 words. No quotes." */
export function bioPrompt(info: DossierInfo): string {
  const name = clamp(info.name, MAX_NAME_LEN);
  const hints: string[] = [];
  if (info.agentRole) hints.push(clamp(info.agentRole, MAX_ROLE_LEN));
  if (info.projectName) hints.push(`works on ${info.projectName}`);
  const hint = hints.length > 0 ? ` Personality hints: ${hints.join("; ")}.` : "";
  return `Write a playful 2-sentence bio for ${name}, a robot on a software campus.${hint} <=40 words. No quotes.`;
}

/**
 * Stable cache key (both the in-memory `bios` map and the KV setting name):
 * the underlying crew agent's id when one is bound, so the same bio
 * survives a crew member going resting <-> working <-> a fresh session —
 * otherwise the dossier's own key (an external/unmanaged session is a
 * one-off, its bio only ever applies to that one session).
 */
function stableKey(info: DossierInfo): string {
  return info.agentId ? `agent:${info.agentId}` : info.key;
}

/** Wrapping pairs a model likes to answer in, stripped outermost-first — same list as flavor/prompt.ts's stripWrappers. */
const WRAPPERS: [string, string][] = [
  ["```", "```"],
  ["**", "**"],
  ['"', '"'],
  ["'", "'"],
  ["`", "`"],
  ["*", "*"],
];

function stripWrappers(text: string): string {
  let s = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [open, close] of WRAPPERS) {
      if (s.length > open.length + close.length && s.startsWith(open) && s.endsWith(close)) {
        s = s.slice(open.length, s.length - close.length).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

/**
 * Shapes a raw model reply into a bio: trim → strip wrapping quotes/fences →
 * reject error-ish replies → clamp to 240 chars. Unlike flavor's
 * sanitizeThought this keeps every line (a bio is 2 sentences, sometimes
 * two lines), not just the first.
 */
function sanitizeBio(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const stripped = stripWrappers(trimmed);
  if (!stripped) return null;
  if (/^error[:\s]/i.test(stripped)) return null;
  return clamp(stripped, MAX_BIO_LEN);
}

interface BiosState {
  bios: Record<string, string>;
  /** The one stable key currently generating, cluster-wide — never more than one Haiku call in flight at once. */
  loading: string | null;
  /** Cached in state → done; else KV hit → cache; else generate (unless flavor is off, or another generation is already running). */
  ensure(info: DossierInfo): void;
  /** Skips the state/KV cache and forces a fresh generation + persist. */
  regenerate(info: DossierInfo): void;
}

/** Keys with a KV-lookup or generation already in flight — dedupes repeated ensure()/regenerate() calls (e.g. one per render). */
const pending = new Set<string>();

export const useBios = create<BiosState>((set, get) => {
  async function generate(key: string, info: DossierInfo): Promise<void> {
    if (!flavorEnabled()) {
      // Not persisted: a placeholder in the KV would look like a cached real
      // bio forever, even after flavor is switched back on. regenerate()
      // (an explicit user action) is what clears it once re-enabled.
      set((s) => ({ bios: { ...s.bios, [key]: BIO_DISABLED_PLACEHOLDER } }));
      return;
    }
    if (get().loading !== null) return; // one generation in flight, cluster-wide
    set({ loading: key });
    try {
      const res = await commands.worldGenerateProp(bioPrompt(info), flavorModel());
      if (res.status === "ok" && res.data.status === "success") {
        const text = sanitizeBio(res.data.text);
        if (text) {
          set((s) => ({ bios: { ...s.bios, [key]: text } }));
          void commands.setSetting(BIO_KEY_PREFIX + key, text).catch(() => undefined);
          bumpFlavorRuns();
        }
      }
    } catch {
      // failure is silent — the card just keeps showing its placeholder, ensure() will retry next mount
    } finally {
      set({ loading: null });
    }
  }

  async function loadOrGenerate(key: string, info: DossierInfo): Promise<void> {
    try {
      const res = await commands.getSetting(BIO_KEY_PREFIX + key);
      if (res.status === "ok" && res.data) {
        set((s) => ({ bios: { ...s.bios, [key]: res.data! } }));
        return;
      }
    } catch {
      // KV unavailable — fall through to generation
    }
    await generate(key, info);
  }

  return {
    bios: {},
    loading: null,
    ensure: (info) => {
      const key = stableKey(info);
      if (get().bios[key] !== undefined) return;
      if (pending.has(key)) return;
      pending.add(key);
      void loadOrGenerate(key, info).finally(() => pending.delete(key));
    },
    regenerate: (info) => {
      const key = stableKey(info);
      if (pending.has(key)) return;
      pending.add(key);
      void generate(key, info).finally(() => pending.delete(key));
    },
  };
});

/** Test hook: clear cached bios and in-flight bookkeeping between tests. */
export function resetBiosForTests(): void {
  pending.clear();
  useBios.setState({ bios: {}, loading: null });
}
