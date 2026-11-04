/* What the Greenhouse style draws with code (shaders, stretchable walls and floors, instanced leaves): one table, a
   key and its drawer, so a key drawn is a key listed. `style.json`'s `coveredKeys` must equal this table's keys and the
   data models' (models.test.ts). A look's or a landmark's key goes through `codeModel` like any other. */
import * as THREE from "three";
import type { EmblemName, ModelKey, ModelOptions } from "@crewhub/world-style";
import * as civic from "./civic.ts";
import { archiveCounter, bench, desk, huddleTable, lamp, leadDesk, officeWindow, roleDesk, shelf, sofa, statusRack, table, workdesk } from "./furniture.ts";
import * as growth from "./growth.ts";
import type { Kit } from "./kit.ts";
import * as life from "./life.ts";
import * as pieces from "./pieces.ts";
import * as shell from "./shell.ts";
import * as town from "./town.ts";

/** What a few drawers need beside the kit: the style's window glass, and a landmark's parts by key. */
export interface DrawContext {
  glass: THREE.Material;
  piece: (key: string) => THREE.Object3D;
}

type Drawer = (kit: Kit, o: ModelOptions, context: DrawContext) => THREE.Object3D;

const emblem =
  (name: EmblemName): Drawer =>
  (kit, o) =>
    pieces.emblem(kit, name, o);

const CODE = {
  "emblem.home": emblem("home"),
  "emblem.inbox": emblem("inbox"),
  "emblem.bot": emblem("bot"),
  "emblem.spark": emblem("spark"),
  "emblem.users": emblem("users"),
  "emblem.star": emblem("star"),
  "emblem.folder": emblem("folder"),
  "ground": (kit, o) => town.ground(kit, o),
  "plot": (kit, o) => town.plot(kit, o),
  "town.paving": (kit, o) => town.paving(kit, o),
  "town.hedge": (kit, o) => town.hedge(kit, o),
  "town.flower-bed": (kit, o) => town.flowerBed(kit, o),
  "town.pond": (kit, o) => town.pond(kit, o),
  "town.bridge": (kit, o) => town.bridge(kit, o),
  "town.stream": (kit, o) => town.stream(kit, o),
  "town.fence": (kit, o) => town.fence(kit, o),
  "town.string-lights": (kit, o) => town.stringLights(kit, o),
  "town.bunting": (kit, o) => town.bunting(kit, o),
  "town.crossing": (kit, o) => town.crossing(kit, o),
  "town.wear": (kit, o) => town.wear(kit, o),
  "town.field": (kit, o) => town.field(kit, o),
  "town.puddle": (kit, o) => town.puddle(kit, o),
  "town.lantern": (kit, o) => town.lantern(kit, o),
  "town.turf": (kit, o) => town.turf(kit, o),
  // What stands between a district's buildings is the planting's to say (style.json "looks"); the town garden
  // leaves the spot to the grass.
  "town.feature": () => new THREE.Group(),
  "town.staked-plot": (kit, o) => growth.stakedPlot(kit, o),
  "town.plot-sign": (kit, o) => growth.plotSign(kit, o),
  "town.scaffolding": (kit, o) => growth.scaffolding(kit, o),
  "town.district-gate": (kit, o) => growth.districtGate(kit, o),
  "town.zone-mark": (kit, o) => pieces.zoneMark(kit, o),
  "path": (kit, o) => pieces.path(kit, o),
  "street-lamp": (kit) => pieces.streetLamp(kit),
  "planting": (kit, o) => pieces.planting(kit, o),
  "furniture.plant": (kit, o) => pieces.planting(kit, o),
  "wall": (kit, o, { glass }) => shell.tallWall(kit, o, glass),
  "wall.low": (kit, o) => shell.rim(kit, o),
  "wall.glass": (kit, o, { glass }) => shell.glassWall(kit, o, glass),
  "door": (kit, o) => shell.entrance(kit, o),
  "building.partition": (kit, o, { glass }) => shell.partition(kit, o, glass),
  "building.door-frame": (kit, o) => shell.doorFrame(kit, o),
  "building.slab": (kit, o) => shell.slab(kit, o),
  "building.apron": (kit, o) => shell.apron(kit, o),
  "building.loading-door": (kit, o) => shell.loadingDoor(kit, o),
  "building.ivy": (kit, o) => shell.ivy(kit, o),
  "building.closed-sign": (kit, o) => shell.closedSign(kit, o),
  "building.name-sign": (kit, o) => shell.nameSign(kit, o),
  "building.wall-lamp": (kit, o) => shell.wallLamp(kit, o),
  "building.floor-shade": (kit, o) => {
    const { width, depth } = o.size ?? { width: 2, height: 0, depth: 2 };
    return kit.edgeShade(width, depth);
  },
  "building.silhouette": (kit, o) => shell.silhouette(kit, o),
  "floor": (kit, o) => pieces.floor(kit, o),
  "room.sign": (kit) => pieces.roomSign(kit),
  "building.flag": (kit, o) => shell.flag(kit, o),
  "building.planks": (kit, o) => shell.planks(kit, o),
  "post-office": (kit, _o, { piece }) => civic.postOffice(kit, piece),
  "town-hall": (kit, _o, { piece }) => civic.townHall(kit, piece),
  "civic.square": (kit, _o, { piece }) => civic.square(kit, piece),
  "civic.cafe": (kit, _o, { piece }) => civic.cafe(kit, piece),
  "civic.greenhouse": (kit) => civic.greenhouse(kit),
  "civic.windmill": (kit) => civic.windmill(kit),
  "civic.welcome-sign": (kit) => civic.welcomeSign(kit),
  "furniture.desk": (kit, o) => desk(kit, o.seed ?? 0),
  "furniture.bench": (kit) => bench(kit),
  "furniture.lamp": (kit) => lamp(kit),
  "furniture.sofa": (kit) => sofa(kit),
  "furniture.table": (kit) => table(kit),
  "furniture.shelf": (kit) => shelf(kit),
  // The floor's desks by role: the analyst's screens, the designer's drawing board (addendum "three rooms").
  "furniture.workdesk": (kit, o) => o.variant === "analyst" || o.variant === "design" ? roleDesk(kit, o.variant, o.seed ?? 0) : workdesk(kit, o.seed ?? 0),
  "furniture.lead-desk": (kit) => leadDesk(kit),
  "furniture.rack-backlog": (kit) => statusRack(kit),
  "furniture.rack-planning": (kit) => statusRack(kit),
  "furniture.rack-review": (kit) => statusRack(kit),
  "furniture.rack-done": (kit) => statusRack(kit),
  "furniture.huddle-table": (kit) => huddleTable(kit),
  "furniture.archive-counter": (kit) => archiveCounter(kit),
  "decor.office-window": (kit) => officeWindow(kit),
  "ticket.strap": (kit, o) => pieces.straps(kit, o),
  "ticket.seal": (kit, o) => pieces.band(kit, o, "seal-tape"),
  "ticket.band": (kit, o) => pieces.band(kit, o, o.accent ?? "sage"),
  "ticket.sticker": (kit, o) => pieces.sticker(kit, o),
  "ticket.speech": (kit) => pieces.speech(kit),
  "sparkle": (kit) => pieces.sparkle(kit),
  "focus-ring": (kit, o) => pieces.focusRing(kit, o),
  "focus-glow": (kit, o) => life.affordance(kit, "outline", o.size?.width ?? 4, o.size?.depth ?? 4),
  "focus-fill": (kit, o) => life.affordance(kit, "fill", o.size?.width ?? 4, o.size?.depth ?? 4),
  "selection-ring": (kit) => life.affordance(kit, "ring", 1.15, 1.15),
  "town.contact-shadow": (kit, o) => pieces.contactShadow(kit, o),
  "town.bird": (kit) => life.bird(kit),
  "town.butterfly": (kit) => life.butterfly(kit),
  "town.firefly": (kit) => life.firefly(kit),
  "town.mote": (kit) => life.mote(kit),
  "town.window-glow": (kit) => life.windowGlow(kit),
  "town.ripple": (kit) => life.ripple(kit),
  "town.steam": (kit) => life.steam(kit),
  "town.cloud-shadow": (kit) => life.cloudShadow(kit),
} satisfies Partial<Record<ModelKey, Drawer>>;

/** Every key the style draws with code. */
export const CODE_KEYS = Object.keys(CODE) as (keyof typeof CODE)[];

/**
 * The model for `key`, or null when code does not draw it. A project's icon comes from loops' data, so an emblem this
 * style has no figure for still stands: the plinth alone (`pieces.emblem`), not the registry's placeholder.
 */
export function codeModel(key: string, kit: Kit, o: ModelOptions, context: DrawContext): THREE.Object3D | null {
  if (Object.hasOwn(CODE, key)) return CODE[key as keyof typeof CODE](kit, o, context);
  return key.startsWith("emblem.") ? pieces.emblem(kit, key.slice("emblem.".length) as EmblemName, o) : null;
}
