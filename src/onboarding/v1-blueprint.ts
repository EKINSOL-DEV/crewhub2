// v1 blueprint import support (EKI-81/EKI-106), standalone (M4 T6 — the
// switch): this used to live in the 3D world panel (panels/world/props/*),
// but that panel is gone — the game shell replaced it (EKI-121→12x) and has
// no room-scoped prop placement of its own yet. The Import-from-v1 dialog is
// the only surviving consumer, so its slice moved here rather than dying
// with the rest of the panel: placement math + persistence (world.props:<room_id>
// KV, unchanged) and the v1 blueprint parser, minus the placement-editor API
// (rotate/scale/edit/remove) and the render-only prop registry (parts,
// colors) that only the deleted 3D view needed. Pure logic, no rendering.

// ── Placed-prop model + persistence (was panels/world/props/placement.ts) ───

export interface PlacedProp {
  /** Instance id, unique within its room. */
  id: string;
  /** Registry id ("core:desk"). Unknown ids render as the fallback crate. */
  propId: string;
  /** Room-local offset from the zone center. */
  x: number;
  z: number;
  /** Y rotation, radians. */
  rot: number;
  scale: number;
  /** Overhead marker glyph (set on import for unknown v1 props: 📦). */
  marker?: string;
}

export interface RoomDims {
  width: number;
  depth: number;
}

/** The old world's fixed room footprint — v1 blueprints have no room of
 * their own to measure, so imports fit into this default (unchanged from
 * panels/world/lib/layout.ts's ROOM_SIZE). */
export const ROOM_SIZE = 10;

const SCALE_MIN = 0.5;
const SCALE_MAX = 2;
/** Keep prop origins off the walls. */
export const EDGE_MARGIN = 0.6;

const STORE_VERSION = 1;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Clamp a prop's origin inside the room's walls (non-finite → center). */
export function clampToRoom(p: PlacedProp, dims: RoomDims): PlacedProp {
  const hw = Math.max(0.1, dims.width / 2 - EDGE_MARGIN);
  const hd = Math.max(0.1, dims.depth / 2 - EDGE_MARGIN);
  const x = Number.isFinite(p.x) ? clamp(p.x, -hw, hw) : 0;
  const z = Number.isFinite(p.z) ? clamp(p.z, -hd, hd) : 0;
  return x === p.x && z === p.z ? p : { ...p, x, z };
}

function clampScale(s: number): number {
  return Number.isFinite(s) ? clamp(s, SCALE_MIN, SCALE_MAX) : 1;
}

/** Wrap a rotation into (-π, π]. */
export function normalizeRot(r: number): number {
  if (!Number.isFinite(r)) return 0;
  let out = r % (Math.PI * 2);
  if (out > Math.PI) out -= Math.PI * 2;
  if (out <= -Math.PI) out += Math.PI * 2;
  return out;
}

/** Settings-KV key for a room's props. */
export function propsSettingKey(roomId: string): string {
  return `world.props:${roomId}`;
}

export function serializeRoomProps(props: readonly PlacedProp[]): string {
  return JSON.stringify({ v: STORE_VERSION, props });
}

function sanitizeEntry(raw: unknown): PlacedProp | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id === "" || typeof o.propId !== "string") return null;
  if (typeof o.x !== "number" || typeof o.z !== "number") return null;
  const p: PlacedProp = {
    id: o.id,
    propId: o.propId,
    x: Number.isFinite(o.x) ? o.x : 0,
    z: Number.isFinite(o.z) ? o.z : 0,
    rot: normalizeRot(typeof o.rot === "number" ? o.rot : 0),
    scale: clampScale(typeof o.scale === "number" ? o.scale : 1),
  };
  if (typeof o.marker === "string" && o.marker) p.marker = o.marker;
  return p;
}

/**
 * Parse a persisted room-props blob. Tolerant: invalid entries are dropped,
 * numbers sanitized; a structurally wrong blob (bad JSON, wrong version)
 * returns null so callers fall back to the starter set.
 */
export function parseStoredRoomProps(text: string): PlacedProp[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== STORE_VERSION || !Array.isArray(o.props)) return null;
  return o.props.map(sanitizeEntry).filter((p): p is PlacedProp => p !== null);
}

// ── Keyword matching (was panels/world/props/registry.ts, trimmed to the
// bits parseV1Blueprint needs — no render parts, no theme colors, no
// creator-prop overrides; those only mattered to the deleted 3D renderer) ──

/** Unknown prop ids render as this (with a 📦 marker overhead). */
export const FALLBACK_PROP_ID = "core:crate";

/** Tokens used to map v1 blueprint prop ids onto a core prop id. */
const CORE_PROP_KEYWORDS: ReadonlyArray<{ id: string; keywords: readonly string[] }> = [
  { id: "core:desk", keywords: ["desk", "table", "workbench", "conference"] },
  { id: "core:chair", keywords: ["chair", "stool", "seat"] },
  { id: "core:plant", keywords: ["plant", "flower", "tree", "pot"] },
  {
    id: "core:bookshelf",
    keywords: ["bookshelf", "shelf", "filing", "cabinet", "locker", "wardrobe", "books"],
  },
  { id: "core:lamp", keywords: ["lamp", "light", "lantern"] },
  { id: "core:rug", keywords: ["rug", "carpet", "mat"] },
  {
    id: "core:coffee",
    keywords: ["coffee", "vending", "fridge", "microwave", "kitchen", "espresso", "water", "cooler"],
  },
  {
    id: "core:whiteboard",
    keywords: ["whiteboard", "board", "notice", "painting", "projector", "screen", "monitor", "clock"],
  },
  { id: "core:couch", keywords: ["couch", "sofa", "bed", "bunk", "bench", "lounge"] },
  { id: FALLBACK_PROP_ID, keywords: ["crate", "box", "storage"] },
];

/**
 * Map a v1 blueprint prop id ("desk-with-monitor", "lamp-floor", …) onto the
 * nearest core prop by keyword overlap. Earlier tokens weigh more (the v1 ids
 * lead with the noun), so "desk-with-monitor" lands on the desk, not the
 * whiteboard. Returns null when nothing overlaps.
 */
export function matchPropId(v1Id: string): string | null {
  const tokens = v1Id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const def of CORE_PROP_KEYWORDS) {
    let score = 0;
    tokens.forEach((tok, i) => {
      if (def.keywords.includes(tok)) score += tokens.length - i;
    });
    if (score > bestScore) {
      bestScore = score;
      best = def.id;
    }
  }
  return best;
}

// ── v1 blueprint parser (was panels/world/props/parse-v1.ts) ────────────────
// Grid of cells, prop ids like "desk-with-monitor" → v2 PlacedProps
// (room-local meters). Accepts the raw blueprint, the API row
// ({ blueprint: {...} }) and the DB row ({ blueprint_json: "..." }).
//
// Tolerance rules:
//   · unknown prop ids → nearest core prop by keyword, else 📦-marked crate
//   · interaction markers (work-point etc.) are dropped silently — they were
//     invisible in v1 too
//   · malformed placements are dropped with a warning, the rest survive
//   · everything is scaled to fit and clamped inside the room

export type V1ParseResult =
  | { ok: true; props: PlacedProp[]; warnings: string[] }
  | { ok: false; error: string };

const DEFAULT_CELL_SIZE = 0.6;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Unwrap API/DB row shapes down to the blueprint object itself. */
function unwrap(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.blueprint_json === "string") {
    try {
      return unwrap(JSON.parse(raw.blueprint_json));
    } catch {
      return null;
    }
  }
  if (isRecord(raw.blueprint)) return raw.blueprint;
  return raw;
}

function isInteractionMarker(propId: string, type: unknown): boolean {
  if (type === "interaction") return true;
  return /(^|-)point(-|\d|$)|^sleep-corner$/.test(propId);
}

export function parseV1Blueprint(text: string, dims: RoomDims): V1ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That doesn't parse as JSON — paste the blueprint JSON itself." };
  }

  const bp = unwrap(raw);
  if (!bp) return { ok: false, error: "Expected a v1 blueprint object." };
  if (!Array.isArray(bp.placements)) {
    return { ok: false, error: "No placements array — this doesn't look like a v1 blueprint." };
  }

  const placements = bp.placements;
  const cell =
    typeof bp.cellSize === "number" && Number.isFinite(bp.cellSize) && bp.cellSize > 0
      ? bp.cellSize
      : DEFAULT_CELL_SIZE;

  // Grid dims: trust the blueprint, else infer from the placements.
  const coordMax = (key: "x" | "z") =>
    placements.reduce((m, p) => (isRecord(p) && typeof p[key] === "number" ? Math.max(m, p[key]) : m), 0);
  const gridDim = (v: unknown, key: "x" | "z") =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : coordMax(key) + 1;
  const gridW = gridDim(bp.gridWidth, "x");
  const gridD = gridDim(bp.gridDepth, "z");

  // Uniform fit: v1 rooms can be up to 24m across; squeeze (never stretch)
  // the whole arrangement into this room's usable floor.
  const usableW = dims.width - 1.2;
  const usableD = dims.depth - 1.2;
  const fit = Math.min(1, usableW / (gridW * cell), usableD / (gridD * cell));

  const props: PlacedProp[] = [];
  const warnings: string[] = [];
  const unknownIds = new Set<string>();
  let dropped = 0;

  placements.forEach((p, i) => {
    if (!isRecord(p) || typeof p.propId !== "string" || typeof p.x !== "number" || typeof p.z !== "number") {
      dropped++;
      return;
    }
    if (isInteractionMarker(p.propId, p.type)) return;

    // Footprint center in grid cells (span anchors are the top-left cell).
    const span = isRecord(p.span) ? p.span : undefined;
    const spanW = typeof span?.w === "number" && span.w > 0 ? span.w : 1;
    const spanD = typeof span?.d === "number" && span.d > 0 ? span.d : 1;
    const cx = p.x + (spanW - 1) / 2 + 0.5;
    const cz = p.z + (spanD - 1) / 2 + 0.5;

    // Grid → room-local meters (grid centered on the room center), then fit.
    const x = (cx * cell - (gridW * cell) / 2) * fit;
    const z = (cz * cell - (gridD * cell) / 2) * fit;

    const matched = matchPropId(p.propId);
    if (!matched) unknownIds.add(p.propId);

    const rot = typeof p.rotation === "number" ? normalizeRot((p.rotation * Math.PI) / 180) : 0;

    props.push(
      clampToRoom(
        {
          id: `v1-${i}`,
          propId: matched ?? FALLBACK_PROP_ID,
          x,
          z,
          rot,
          scale: 1,
          ...(matched ? {} : { marker: "📦" }),
        },
        dims,
      ),
    );
  });

  for (const id of unknownIds) warnings.push(`Unknown prop "${id}" → 📦 crate`);
  if (dropped > 0) warnings.push(`Dropped ${dropped} malformed placement${dropped === 1 ? "" : "s"}`);

  return { ok: true, props, warnings };
}
