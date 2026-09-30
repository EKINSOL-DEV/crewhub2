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
  "emblem.home",
  "emblem.inbox",
  "emblem.bot",
  "emblem.spark",
  "emblem.users",
  "emblem.star",
  "emblem.folder",
  "post-office",
  "town-hall",
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
];

/** Top surface heights (m) where objects are set down, for models whose bounding box is taller than the top. */
export const SURFACES: Partial<Record<ModelKey, number>> = {
  "furniture.workdesk": 0.565,
  "furniture.lead-desk": 0.635,
  "furniture.desk": 0.92,
};
