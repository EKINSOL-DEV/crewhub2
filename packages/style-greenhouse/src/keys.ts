/* The keys the Greenhouse style draws with code, and the aliases that reuse another key. The data keys are the files
   in ../models (`<key>.json`, `<key>.<variant>.json` for a variant). `style.json`'s `coveredKeys` must equal the union;
   a test checks it. Pure: no three.js, so tests can read it. */
import type { ModelKey } from "@crewhub/world-style";

export const CODE_KEYS: readonly ModelKey[] = [
  "ground",
  "plot",
  "path",
  "street-lamp",
  "planting",
  "wall",
  "wall.glass",
  "wall.low",
  "door",
  "floor",
  "room.sign",
  "building.flag",
  "building.planks",
  "building.partition",
  "building.door-frame",
  "building.slab",
  "building.apron",
  "building.loading-door",
  "building.ivy",
  "building.closed-sign",
  "building.wall-lamp",
  "building.silhouette",
  "emblem.home",
  "emblem.inbox",
  "emblem.bot",
  "emblem.spark",
  "emblem.users",
  "emblem.star",
  "emblem.folder",
  "post-office",
  "town-hall",
  "civic.square",
  "civic.cafe",
  "civic.greenhouse",
  "civic.windmill",
  "civic.welcome-sign",
  "furniture.desk",
  "furniture.plant",
  "furniture.bench",
  "furniture.lamp",
  "furniture.sofa",
  "furniture.table",
  "furniture.shelf",
  "furniture.workdesk",
  "furniture.lead-desk",
  "ticket.strap",
  "ticket.seal",
  "ticket.band",
  "ticket.sticker",
  "ticket.speech",
  "sparkle",
  "focus-ring",
  "town.paving",
  "town.hedge",
  "town.flower-bed",
  "town.pond",
  "town.bridge",
  "town.fence",
  "town.lantern",
  "town.crossing",
  "town.wear",
  "town.contact-shadow",
];

/** Top surface heights (m) where objects are set down, for models whose bounding box is taller than the top. */
export const SURFACES: Partial<Record<ModelKey, number>> = {
  "furniture.workdesk": 0.565,
  "furniture.lead-desk": 0.635,
  "furniture.desk": 0.92,
};

/** A pool of lamp light: its radius, and its height and offset in the model's own frame (origin: footprint centre). */
export interface LightPool {
  radius: number;
  y: number;
  x?: number;
  z?: number;
}

/**
 * Lamps that throw a warm pool of light on the ground under lamplight. Other lamps can join by key; a model with
 * several lamps (the square, the café) lists a pool per lamp.
 */
export const LIGHT_POOLS: Partial<Record<ModelKey, LightPool | LightPool[]>> = {
  "furniture.lamp": { radius: 1.1, y: 0.012 },
  "street-lamp": { radius: 2.2, y: 0.03 },
  "desk-lamp": { radius: 0.4, y: 0.006 },
  "town.lantern": { radius: 3, y: 0.075 },
  "decor.pendant-lamp": { radius: 0.9, y: 0.012 },
  "civic.square": [-2.55, 2.55].flatMap((x) => [-2.55, 2.55].map((z) => ({ radius: 1.6, y: 0.14, x, z }))),
  "civic.cafe": [
    { radius: 2.4, y: 0.1, x: 0, z: 1.1 },
    { radius: 1.1, y: 0.1, x: -1.32, z: -0.2 },
    { radius: 1.1, y: 0.1, x: 1.32, z: -0.2 },
  ],
  // Mounted on a door post at floor level; the pool lies in front, just above the top step.
  "building.wall-lamp": { radius: 1.4, y: -0.1, z: 0.7 },
};
