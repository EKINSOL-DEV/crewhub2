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
  ROT_STEP,
  snap,
  type CampusEdits,
  type PlaceableKind,
  type PlacedBuilding,
  type PlacedItem,
} from "./edits";

export const EDITS_SETTING_KEY = "game.campus.edits";

const STORE_VERSION = 1;

interface StoredBlob {
  counter: number;
  edits: CampusEdits;
}

function serialize(edits: CampusEdits, counter: number): string {
  return JSON.stringify({ v: STORE_VERSION, counter, edits });
}

function isCampusEditsShape(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.items) && Array.isArray(o.buildings) && Array.isArray(o.removedDefaults);
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Pre-M5 blobs lack `plotProjects` and their buildings lack `projectId` —
 * fill defaults here (rather than rejecting the whole blob in isCampusEditsShape)
 * so old saves keep loading cleanly.
 */
function normalizeEdits(o: Record<string, unknown>): CampusEdits {
  const buildings = (o.buildings as PlacedBuilding[]).map((b) => ({ ...b, projectId: b.projectId ?? null }));
  const plotProjects = isPlainRecord(o.plotProjects) ? (o.plotProjects as Record<number, string>) : {};
  return {
    items: o.items as PlacedItem[],
    buildings,
    removedDefaults: o.removedDefaults as string[],
    plotProjects,
  };
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
  if (o.v !== STORE_VERSION || typeof o.counter !== "number" || !isCampusEditsShape(o.edits)) return null;
  return { counter: o.counter, edits: normalizeEdits(o.edits) };
}

function normalizeRot(r: number): number {
  let out = r % (Math.PI * 2);
  if (out > Math.PI) out -= Math.PI * 2;
  if (out <= -Math.PI) out += Math.PI * 2;
  return out;
}

/** Bump only `kind`'s counter — CampusWorld keys each kind's InstancedModel
 *  off this so moving one tree remounts just the tree group, not every
 *  placed kind (bench, lantern, hedge, …) on the campus. */
function bumpKind(map: Record<string, number>, kind: PlaceableKind | undefined): Record<string, number> {
  if (!kind) return map;
  return { ...map, [kind]: (map[kind] ?? 0) + 1 };
}

interface CampusEditsState {
  edits: CampusEdits;
  version: number;
  /** Per-kind counterpart to `version`, bumped only for the mutated item's
   *  kind (buildings keep just the global `version` — PlacedBuildings has
   *  no InstancedModel keying to spare). Item add/move/rotate/remove bump
   *  both: `version` still drives the nav-grid re-derive in use-sim.ts
   *  (every kind can block pathing), `versionByKind` drives the render key. */
  versionByKind: Record<string, number>;
  /** Load persisted edits once. Idempotent. */
  init: () => Promise<void>;
  addItem: (kind: PlaceableKind, x: number, z: number, rot: number) => void;
  moveItem: (id: string, x: number, z: number) => void;
  rotateItem: (id: string, step: number) => void;
  removeItem: (id: string) => void;
  /** Returns the new building's id — RoomLinkDialog needs it right away to target `setBuildingProject`. */
  addBuilding: (rect: Rect, roomId: string | null) => string;
  removeBuilding: (id: string) => void;
  /** Link (or unlink, with null) plotIndex's default pavilion to a project (M5). */
  setPlotProject: (plotIndex: number, projectId: string | null) => void;
  /** Link (or unlink, with null) a specific player-built pavilion to a project (M5). */
  setBuildingProject: (id: string, projectId: string | null) => void;
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
  versionByKind: {},

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
    set((s) => ({ edits, version: s.version + 1, versionByKind: bumpKind(s.versionByKind, kind) }));
  },

  moveItem: (id, x, z) => {
    const kind = get().edits.items.find((i) => i.id === id)?.kind;
    const edits: CampusEdits = {
      ...get().edits,
      items: get().edits.items.map((i) => (i.id === id ? { ...i, x: snap(x), z: snap(z) } : i)),
    };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1, versionByKind: bumpKind(s.versionByKind, kind) }));
  },

  rotateItem: (id, step) => {
    const kind = get().edits.items.find((i) => i.id === id)?.kind;
    const edits: CampusEdits = {
      ...get().edits,
      items: get().edits.items.map((i) =>
        i.id === id ? { ...i, rot: normalizeRot(i.rot + step * ROT_STEP) } : i,
      ),
    };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1, versionByKind: bumpKind(s.versionByKind, kind) }));
  },

  removeItem: (id) => {
    const kind = get().edits.items.find((i) => i.id === id)?.kind;
    const edits: CampusEdits = { ...get().edits, items: get().edits.items.filter((i) => i.id !== id) };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1, versionByKind: bumpKind(s.versionByKind, kind) }));
  },

  addBuilding: (rect, roomId) => {
    const building: PlacedBuilding = {
      id: nextId(),
      x: snap(rect.x),
      z: snap(rect.z),
      w: snap(rect.w),
      d: snap(rect.d),
      roomId,
      projectId: null,
    };
    const edits: CampusEdits = { ...get().edits, buildings: [...get().edits.buildings, building] };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1 }));
    return building.id;
  },

  removeBuilding: (id) => {
    const edits: CampusEdits = {
      ...get().edits,
      buildings: get().edits.buildings.filter((b) => b.id !== id),
    };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1 }));
  },

  setPlotProject: (plotIndex, projectId) => {
    const plotProjects = { ...get().edits.plotProjects };
    if (projectId === null) delete plotProjects[plotIndex];
    else plotProjects[plotIndex] = projectId;
    const edits: CampusEdits = { ...get().edits, plotProjects };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1 }));
  },

  setBuildingProject: (id, projectId) => {
    const edits: CampusEdits = {
      ...get().edits,
      buildings: get().edits.buildings.map((b) => (b.id === id ? { ...b, projectId } : b)),
    };
    persist(edits);
    set((s) => ({ edits, version: s.version + 1 }));
  },
}));

/** Test hook: allow re-running init and resetting the id counter after a store reset. */
export function resetCampusEditsForTests(): void {
  counter = 0;
  requested = false;
  useCampusEdits.setState({ edits: EMPTY_EDITS, version: 0, versionByKind: {} });
}
