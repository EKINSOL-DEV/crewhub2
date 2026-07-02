// Campus build-mode edits (M3 T1): in-memory truth + best-effort persistence
// in the settings KV (`game.campus.edits`, JSON) — the props/store.ts pattern
// (src/panels/world/props/store.ts): load once, mutate in memory, persist
// fire-and-forget. Ids come from a counter carried inside the blob, never
// Date.now()/Math.random(), so replays and tests stay deterministic.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";
import type { Rect } from "@/game/world/campus/layout";
import {
  EMPTY_EDITS,
  snap,
  type CampusEdits,
  type PlaceableKind,
  type PlacedBuilding,
  type PlacedItem,
} from "./edits";

export const EDITS_SETTING_KEY = "game.campus.edits";

const STORE_VERSION = 1;
/** One rotate step = 15°, same convention as the props placement editor. */
const ROT_STEP = Math.PI / 12;

interface StoredBlob {
  counter: number;
  edits: CampusEdits;
}

function serialize(edits: CampusEdits, counter: number): string {
  return JSON.stringify({ v: STORE_VERSION, counter, edits });
}

function isCampusEdits(v: unknown): v is CampusEdits {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.items) && Array.isArray(o.buildings) && Array.isArray(o.removedDefaults);
}

/** Defensive parse: any structural mismatch (bad JSON, wrong version) → null, caller falls back to EMPTY_EDITS. */
function parse(text: string): StoredBlob | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== STORE_VERSION || typeof o.counter !== "number" || !isCampusEdits(o.edits)) return null;
  return { counter: o.counter, edits: o.edits };
}

function normalizeRot(r: number): number {
  let out = r % (Math.PI * 2);
  if (out > Math.PI) out -= Math.PI * 2;
  if (out <= -Math.PI) out += Math.PI * 2;
  return out;
}

interface CampusEditsState {
  edits: CampusEdits;
  version: number;
  /** Load persisted edits once. Idempotent. */
  init: () => Promise<void>;
  addItem: (kind: PlaceableKind, x: number, z: number, rot: number) => void;
  moveItem: (id: string, x: number, z: number) => void;
  rotateItem: (id: string, step: number) => void;
  removeItem: (id: string) => void;
  addBuilding: (rect: Rect, roomId: string | null) => void;
  removeBuilding: (id: string) => void;
}

let counter = 0;
let requested = false;

function nextId(): string {
  return `e${counter++}`;
}

function persist(edits: CampusEdits): void {
  void commands.setSetting(EDITS_SETTING_KEY, serialize(edits, counter)).catch(() => undefined);
}

export const useCampusEdits = create<CampusEditsState>((set, get) => ({
  edits: EMPTY_EDITS,
  version: 0,

  init: async () => {
    if (requested) return;
    requested = true;
    try {
      const res = await commands.getSetting(EDITS_SETTING_KEY);
      if (res.status === "ok" && res.data) {
        const blob = parse(res.data);
        if (blob) {
          counter = blob.counter;
          set((s) => ({ edits: blob.edits, version: s.version + 1 }));
        }
      }
    } catch {
      // backend unavailable (unit tests) — keep EMPTY_EDITS
    }
  },

  addItem: (kind, x, z, rot) => {
    const item: PlacedItem = { id: nextId(), kind, x: snap(x), z: snap(z), rot };
    const edits: CampusEdits = { ...get().edits, items: [...get().edits.items, item] };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1 }));
  },

  moveItem: (id, x, z) => {
    const edits: CampusEdits = {
      ...get().edits,
      items: get().edits.items.map((i) => (i.id === id ? { ...i, x: snap(x), z: snap(z) } : i)),
    };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1 }));
  },

  rotateItem: (id, step) => {
    const edits: CampusEdits = {
      ...get().edits,
      items: get().edits.items.map((i) =>
        i.id === id ? { ...i, rot: normalizeRot(i.rot + step * ROT_STEP) } : i,
      ),
    };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1 }));
  },

  removeItem: (id) => {
    const edits: CampusEdits = { ...get().edits, items: get().edits.items.filter((i) => i.id !== id) };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1 }));
  },

  addBuilding: (rect, roomId) => {
    const building: PlacedBuilding = {
      id: nextId(),
      x: snap(rect.x),
      z: snap(rect.z),
      w: snap(rect.w),
      d: snap(rect.d),
      roomId,
    };
    const edits: CampusEdits = { ...get().edits, buildings: [...get().edits.buildings, building] };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1 }));
  },

  removeBuilding: (id) => {
    const edits: CampusEdits = {
      ...get().edits,
      buildings: get().edits.buildings.filter((b) => b.id !== id),
    };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1 }));
  },
}));

/** Test hook: allow re-running init and resetting the id counter after a store reset. */
export function resetCampusEditsForTests(): void {
  counter = 0;
  requested = false;
  useCampusEdits.setState({ edits: EMPTY_EDITS, version: 0 });
}
