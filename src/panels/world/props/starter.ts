// Default furnishing (EKI-81): rooms with no persisted props get a small,
// deterministic starter set — a hash of the room id picks 2–4 props from a
// cozy pool and tucks them near the corners, facing the room center. Pure;
// never persisted until the user actually edits.
import { clampToRoom, type PlacedProp, type RoomDims } from "./placement";

/** Subtle, lounge-y picks — no desks/whiteboards forced on anyone. */
const POOL = ["core:plant", "core:lamp", "core:bookshelf", "core:couch", "core:coffee", "core:rug"] as const;

/** FNV-1a, 32-bit — stable across sessions and platforms. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function starterProps(roomId: string, dims: RoomDims): PlacedProp[] {
  const h = hash(roomId);
  const count = 2 + (h % 3); // 2..4
  const cx = dims.width / 2 - 1.6;
  const cz = dims.depth / 2 - 1.6;
  // Corner slots in a hash-rotated order so rooms don't all furnish the same
  // corner first. North-west last — that wall carries the task wall.
  const corners: [number, number][] = [
    [cx, -cz],
    [-cx, cz],
    [cx, cz],
    [-cx, -cz],
  ];
  const cornerStart = (h >>> 8) % corners.length;
  const poolStart = (h >>> 4) % POOL.length;
  // Step coprime with pool length → `count` distinct picks.
  const step = ((h >>> 12) % 2) * 4 + 1; // 1 or 5, both coprime with 6

  return Array.from({ length: count }, (_, i) => {
    const propId = POOL[(poolStart + i * step) % POOL.length]!;
    const [bx, bz] = corners[(cornerStart + i) % corners.length]!;
    // Small deterministic jitter so corners don't look stamped.
    const jx = (((h >>> (i * 3)) & 7) / 7 - 0.5) * 0.8;
    const jz = (((h >>> (i * 3 + 8)) & 7) / 7 - 0.5) * 0.8;
    const x = bx + jx;
    const z = bz + jz;
    return clampToRoom({ id: `starter-${i}`, propId, x, z, rot: Math.atan2(-x, -z), scale: 1 }, dims);
  });
}
