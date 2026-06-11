// Home-slot math (EKI-62/66): where each bot stands by default. Anchors
// (top-level sessions) get an even grid inside their room; subagents ring
// their parent at CLUSTER_RADIUS. Wandering (wander.ts) starts from here.
import type { WorldBot } from "./bots";
import { LOBBY_ID, type WorldBounds, type WorldLayout, type WorldZone } from "./layout";

export const CLUSTER_RADIUS = 1.6;
/** Keep bots off the walls. */
const WALL_MARGIN = 1.2;

export function roomInnerBounds(zone: WorldZone): WorldBounds {
  const hw = Math.max(0.5, zone.width / 2 - WALL_MARGIN);
  const hd = Math.max(0.5, zone.size / 2 - WALL_MARGIN);
  return {
    minX: zone.center[0] - hw,
    maxX: zone.center[0] + hw,
    minZ: zone.center[1] - hd,
    maxZ: zone.center[1] + hd,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Even `cols × rows` grid of `n` cell centers inside `b`, row-major. */
function gridSlots(n: number, b: WorldBounds): [number, number][] {
  if (n === 1) return [[(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  return [...Array(n).keys()].map((i) => [
    b.minX + ((i % cols) + 0.5) * (w / cols),
    b.minZ + (Math.floor(i / cols) + 0.5) * (d / rows),
  ]);
}

/**
 * Deterministic home position per bot key. Unknown room ids fall back to the
 * lobby (a bot must always be *somewhere* visible).
 */
export function assignHomes(bots: WorldBot[], world: WorldLayout): Map<string, [number, number]> {
  const zones = new Map(world.rooms.map((z) => [z.id, z]));
  const lobby = zones.get(LOBBY_ID) ?? world.rooms[world.rooms.length - 1]!;
  const homes = new Map<string, [number, number]>();
  const present = new Set(bots.map((b) => b.key));

  // Group by zone, order-stable by key so layout doesn't shuffle on refresh.
  const byZone = new Map<string, WorldBot[]>();
  for (const bot of [...bots].sort((a, b) => a.key.localeCompare(b.key))) {
    const zid = zones.has(bot.roomId) ? bot.roomId : LOBBY_ID;
    const list = byZone.get(zid) ?? [];
    list.push(bot);
    byZone.set(zid, list);
  }

  for (const [zid, zoneBots] of byZone) {
    const zone = zones.get(zid) ?? lobby;
    const b = roomInnerBounds(zone);

    // Anchors: top-level bots plus orphaned subagents (parent not rendered).
    const anchors = zoneBots.filter((x) => !x.parentKey || !present.has(x.parentKey));
    const slots = gridSlots(Math.max(1, anchors.length), b);
    anchors.forEach((a, i) => homes.set(a.key, slots[i]!));

    // Subagents: ring around the parent, clamped to the room.
    const clustered = zoneBots.filter((x) => x.parentKey && present.has(x.parentKey));
    const byParent = new Map<string, WorldBot[]>();
    for (const c of clustered) {
      const list = byParent.get(c.parentKey!) ?? [];
      list.push(c);
      byParent.set(c.parentKey!, list);
    }
    for (const [parentKey, kids] of byParent) {
      const p = homes.get(parentKey) ?? slots[0]!;
      kids.forEach((kid, i) => {
        const angle = (i / kids.length) * Math.PI * 2 + Math.PI / 6;
        homes.set(kid.key, [
          clamp(p[0] + Math.cos(angle) * CLUSTER_RADIUS, b.minX, b.maxX),
          clamp(p[1] + Math.sin(angle) * CLUSTER_RADIUS, b.minZ, b.maxZ),
        ]);
      });
    }
  }

  return homes;
}
