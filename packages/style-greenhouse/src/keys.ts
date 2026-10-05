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
  "building.name-sign",
  "building.silhouette",
  "building.floor-shade",
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
  "focus-glow",
  "focus-fill",
  "selection-ring",
  "town.paving",
  "town.hedge",
  "town.flower-bed",
  "town.pond",
  "town.bridge",
  "town.stream",
  "town.puddle",
  "town.bunting",
  "town.fence",
  "town.lantern",
  "town.crossing",
  "town.string-lights",
  "town.wear",
  "town.field",
  "town.staked-plot",
  "town.plot-sign",
  "town.scaffolding",
  "town.district-gate",
  "town.contact-shadow",
  "town.bird",
  "town.butterfly",
  "town.firefly",
  "town.mote",
  "town.window-glow",
  "town.ripple",
  "town.steam",
  "town.cloud-shadow",
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
  /** "screen": the cool glow of a monitor on the desk and the floor in front of it; a warm lamp pool otherwise. */
  kind?: "screen";
}

/** A desk's screen glow: on the desk top in front of the screen (+z) and on the floor where the chair stands. */
const screenGlow = (top: number, scale: number): LightPool[] => [
  { radius: 0.45 * scale, y: top + 0.004, z: 0.12 * scale, kind: "screen" },
  { radius: 0.95 * scale, y: 0.014, z: 0.85 * scale, kind: "screen" },
];

/**
 * Lamps that throw a warm pool of light on the ground under lamplight. Other lamps can join by key; a model with
 * several lamps (the square, the café) lists a pool per lamp.
 */
export const LIGHT_POOLS: Partial<Record<ModelKey, LightPool | LightPool[]>> = {
  "furniture.lamp": { radius: 1.3, y: 0.012 },
  "street-lamp": { radius: 2.2, y: 0.03 },
  "desk-lamp": { radius: 0.4, y: 0.006 },
  "town.lantern": { radius: 3, y: 0.075 },
  "decor.pendant-lamp": { radius: 1.25, y: 0.012 },
  "furniture.floor-lamp": { radius: 1.15, y: 0.012 },
  "furniture.reading-lamp": { radius: 0.95, y: 0.012, x: 0.1, z: 0.1 },
  "decor.table-lamp": { radius: 0.6, y: 0.004 },
  // Monitors face the seat, away from the camera: their glow shows as cool light on the desk and the chair's floor.
  "furniture.workdesk": screenGlow(0.565, 0.62),
  "furniture.lead-desk": screenGlow(0.635, 0.7),
  "furniture.desk": screenGlow(0.92, 1),
  // The corner lamps, and a wide soft wash under the string lights across the middle (round the fountain).
  "civic.square": [...[-2.55, 2.55].flatMap((x) => [-2.55, 2.55].map((z) => ({ radius: 1.6, y: 0.14, x, z }))), { radius: 3.6, y: 0.13 }],
  "civic.cafe": [
    { radius: 2.4, y: 0.1, x: 0, z: 1.1 },
    { radius: 1.1, y: 0.1, x: -1.32, z: -0.2 },
    { radius: 1.1, y: 0.1, x: 1.32, z: -0.2 },
  ],
  // The landmarks' lit front windows spill warm light on the paving and the podium in front of them (civic.ts frames:
  // the post office's front is at z 0.6, the town hall's facade at z -0.6 on a podium 0.48 high).
  "post-office": [
    { radius: 1.3, y: 0.05, x: -2.75, z: 1.45 },
    { radius: 1.7, y: 0.05, x: 1.75, z: 1.5 },
  ],
  "town-hall": [-3.3, 3.3].map((x) => ({ radius: 1.2, y: 0.5, x, z: 0.25 })),
  // Mounted on a door post at floor level; the pool lies in front, just above the top step.
  "building.wall-lamp": { radius: 1.4, y: -0.1, z: 0.7 },
  // The truck's headlights throw one warm pool on the road ahead of the cab (its front faces +x).
  truck: { radius: 0.75, y: 0.012, x: 1.35 },
};

/**
 * Models that move and carry their own soft blob contact shadow (every quality setting): its half-size and soft edge
 * in the model's own frame, at floor level.
 */
export const BLOB_SHADOWS: Partial<Record<ModelKey, { halfX: number; halfZ: number; soft: number }>> = {
  truck: { halfX: 0.7, halfZ: 0.32, soft: 0.22 },
};
