// Creator-made props (EKI-83): a small registry of PropDefinitions alongside
// the core set, persisted as one settings-KV blob (`world.creator_props`,
// JSON) — no schema changes. `resolveProp` in registry.ts consults this store
// first, so `creator:` ids render everywhere without call-site changes.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";
import { isColorRole } from "./creator";
import type { PropDefinition, PropPart } from "./registry";
import { PERSIST_DEBOUNCE_MS } from "./store";

export const CREATOR_PROPS_KEY = "world.creator_props";
const STORE_VERSION = 1;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── Pure fold + (de)serialization ────────────────────────────────────────────

/** Pure fold: add or replace one definition. */
export function addCustomDef(
  defs: Readonly<Record<string, PropDefinition>>,
  def: PropDefinition,
): Record<string, PropDefinition> {
  return { ...defs, [def.id]: def };
}

/** Pure fold: drop one definition; untouched record if absent. */
export function removeCustomDef(
  defs: Readonly<Record<string, PropDefinition>>,
  id: string,
): Record<string, PropDefinition> {
  if (!(id in defs)) return { ...defs };
  const next = { ...defs };
  delete next[id];
  return next;
}

export function serializeCustomProps(defs: Readonly<Record<string, PropDefinition>>): string {
  return JSON.stringify({ v: STORE_VERSION, defs: Object.values(defs) });
}

// Defs were validated by the creator parser before they were persisted; a
// structural check keeps corrupt blobs from reaching the renderer.
function sanitizePart(raw: unknown): PropPart | null {
  if (!isRecord(raw)) return null;
  const { shape, at } = raw;
  if (shape !== "box" && shape !== "cylinder" && shape !== "sphere" && shape !== "cone") return null;
  if (!Array.isArray(raw.size) || !raw.size.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  if (
    !Array.isArray(at) ||
    at.length !== 3 ||
    !at.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    return null;
  }
  if (!isColorRole(raw.color)) return null;
  const rotY = typeof raw.rotY === "number" && Number.isFinite(raw.rotY) ? raw.rotY : undefined;
  return {
    shape,
    size: raw.size as number[],
    at: at as [number, number, number],
    color: raw.color,
    ...(rotY === undefined ? {} : { rotY }),
  };
}

function sanitizeDef(raw: unknown): PropDefinition | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || raw.id === "" || typeof raw.label !== "string") return null;
  if (typeof raw.emoji !== "string" || typeof raw.radius !== "number" || !Number.isFinite(raw.radius)) {
    return null;
  }
  if (!Array.isArray(raw.parts)) return null;
  const parts = raw.parts.map(sanitizePart).filter((p): p is PropPart => p !== null);
  if (parts.length === 0) return null;
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.filter((k): k is string => typeof k === "string")
    : [];
  return { id: raw.id, label: raw.label, emoji: raw.emoji, radius: raw.radius, keywords, parts };
}

/**
 * Parse the persisted creator-props blob. Tolerant: invalid defs are dropped;
 * a structurally wrong blob (bad JSON, wrong version) returns null so callers
 * start empty.
 */
export function parseStoredCustomProps(text: string): Record<string, PropDefinition> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.v !== STORE_VERSION || !Array.isArray(raw.defs)) return null;
  const out: Record<string, PropDefinition> = {};
  for (const entry of raw.defs) {
    const def = sanitizeDef(entry);
    if (def) out[def.id] = def;
  }
  return out;
}

// ── The store ────────────────────────────────────────────────────────────────

let requested = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function persistLater(defs: Record<string, PropDefinition>): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void commands.setSetting(CREATOR_PROPS_KEY, serializeCustomProps(defs)).catch(() => undefined);
  }, PERSIST_DEBOUNCE_MS);
}

interface CustomPropsState {
  defs: Record<string, PropDefinition>;
  /** Load the persisted creator props once (KV → parse → else empty). Idempotent. */
  init: () => Promise<void>;
  /** Add (or replace) a definition: state now, KV write debounced. */
  addDef: (def: PropDefinition) => void;
  removeDef: (id: string) => void;
}

export const useCustomProps = create<CustomPropsState>((set, get) => ({
  defs: {},

  init: async () => {
    if (requested) return;
    requested = true;
    try {
      const res = await commands.getSetting(CREATOR_PROPS_KEY);
      if (res.status === "ok" && res.data) {
        const defs = parseStoredCustomProps(res.data);
        if (defs) set({ defs });
      }
    } catch {
      // backend unavailable (unit tests) — start empty
    }
  },

  addDef: (def) => {
    const defs = addCustomDef(get().defs, def);
    set({ defs });
    persistLater(defs);
  },

  removeDef: (id) => {
    const defs = removeCustomDef(get().defs, id);
    set({ defs });
    persistLater(defs);
  },
}));
