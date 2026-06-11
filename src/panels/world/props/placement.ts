// Placed-prop model + pure placement math (EKI-81). Positions are *room-local*
// offsets from the zone center, so rooms can reshuffle on the world grid
// without props drifting. Persistence is one settings-KV JSON blob per room
// (`world.props:<room_id>`) — no schema changes.

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

export const SCALE_MIN = 0.5;
export const SCALE_MAX = 2;
/** One bracket-key tap = 15°. */
export const ROT_STEP = Math.PI / 12;
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

export function clampScale(s: number): number {
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
