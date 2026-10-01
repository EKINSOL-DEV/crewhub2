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

/**
 * Lamps that throw a warm pool of light on the ground under lamplight: its radius, and its height and offset in the
 * model's own frame (the model's origin is its footprint centre). Other lamps can join by key.
 */
export const LIGHT_POOLS: Partial<Record<ModelKey, { radius: number; y: number; z?: number }>> = {
  "furniture.lamp": { radius: 1.1, y: 0.012 },
  "street-lamp": { radius: 2.2, y: 0.03 },
  "desk-lamp": { radius: 0.4, y: 0.006 },
  "town.lantern": { radius: 3, y: 0.075 },
};
