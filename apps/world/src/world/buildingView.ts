/* One building on its plot, drawn from the WorldModel with the building's resolved style. Two levels of detail: every
   building shows its shell (room floors, low walls with door gaps, flag, emblem), its agents at their desks and the
   height of each status room's pile; the entered building adds the furniture, every work object, the signals (desk
   lamps, quiet clocks, the attention beacon, trophy, banner, mailbox letters) and the ticket drones. Layers rebuild
   only when their signature changes. */
import * as THREE from "three";
import type { AgentPlacement, Building, RoomKind } from "@crewhub/world-model";
import type { Cast, CastRole, FigureHandle } from "@crewhub/world-cast";
import type { EmblemName, ModelKey, PaletteName, ResolvedStyle } from "@crewhub/world-style";
import {
  BACK_WALL_HEIGHT,
  BUILDING_CELL as CELL,
  buildingTemplate,
  DEPTH,
  doorOpenings,
  ENTRANCE,
  FLOOR_RISE,
  dressingZones,
  interiorDefinitions,
  LOADING,
  MAX_WIDTH,
  PLOT_MARGIN,
  roomOf,
  STATUS_ROOMS,
  wallRuns,
  type BuildingTemplate,
  type WallRun,
} from "./buildingTemplate";
import { assignDesks, PILE_ROOMS, placeObjects, roomCentre, type DeskSlot, type ObjectLayout, type Surface } from "./interiorLayout";
import { mergeStatic } from "./mergeStatic";
import { ObjectLayer } from "./objectLayer";
import { cellAt, footprintPose, resolveBuildingPlacements, type BuildingPlacements } from "./placements";
import { PropLayer, type TownLayer } from "./propLayer";
import { figureRole, figureState, type FigureFacts } from "./figureState";
import type { RobotCrowd } from "./robotCrowd";
import { deskItems, DRESS_PREFIX, dressingSeed, roomDecor, type DecorItem } from "./roomDressing";
import type { Bounds } from "./townLayout";
import type { Walker } from "./walks";

/** Figures and desks are Greenhouse-sized; interiors show them at this scale. */
const ROBOT_SCALE = 0.62;
/** The ground radius the style's selection ring is drawn for: a wider or slimmer figure scales it. */
const RING_GROUND = 0.4;
/** Figures stand this far above the floor, clear of rugs and decals. */
const FLOOR_LIFT = 0.02;
const TRUCK_S = 2.4;
/** The truck's parking spot on its apron, backed up to dispatch's loading door, building cells. */
const TRUCK_SPOT = { x: (LOADING.x1 + LOADING.x2) / 2, z: DEPTH + 1.6 };
/** Per wall side: the model, its height and its thickness (world units). The tall walls are the old room's height. */
const WALLS: Record<WallRun["side"], [ModelKey, number, number]> = {
  north: ["wall.glass", BACK_WALL_HEIGHT, 0.16],
  west: ["wall", BACK_WALL_HEIGHT, 0.16],
  south: ["wall.low", 0.22, 0.12],
  east: ["wall.low", 0.22, 0.12],
  inner: ["building.partition", 0.52, 0.1],
};
/** A pick target that is never drawn: the renderer skips invisible materials, the raycaster does not. */
const PICK_ONLY = new THREE.MeshBasicMaterial({ visible: false });

const noShadow = (object: THREE.Object3D) => (object.traverse((o) => (o.castShadow = false)), object);

/** The far-detail class of each furniture and dressing piece (the style draws `building.silhouette` per class). */
const FAR_FURNITURE: Record<string, string> = {
  workdesk: "desk",
  "lead-desk": "desk",
  "meeting-table": "table",
  "planning-table": "table",
  "coffee-table": "table",
  "side-table": "table",
  "coffee-counter": "table",
  rack: "shelf",
  bookshelf: "shelf",
  "storage-shelf": "shelf",
  "roller-shelf": "shelf",
  "filing-cabinet": "shelf",
  "lounge-sofa": "sofa",
  armchair: "sofa",
  bench: "sofa",
  plant: "plant",
  "review-pile": "crate",
  pallet: "crate",
  "board-stand": "board",
  "mood-board": "board",
  "reception-desk": "table",
  "drafting-table": "table",
  "review-desk": "desk",
  "parcel-cart": "crate",
  "crate-stack": "crate",
  "autumn-vase": "plant",
};
/** The room edge a wall piece hangs on. */
type WallFace = "north" | "west" | "south" | "east";
/** Decor that hangs on a wall (roomDressing's wall art), by key prefix. */
const WALL_HUNG = [
  "decor.wall-",
  "decor.picture",
  "decor.poster",
  "decor.whiteboard",
  "decor.screen",
  "decor.pin-board",
  "decor.map-wall",
  "decor.chart-wall",
  "decor.mood-wall",
  "decor.window-box",
  "decor.station-clock",
];
/** Rugs seen from the town, their size in cells. */
const FAR_RUGS: Partial<Record<ModelKey, [number, number]>> = {
  "decor.rug-round": [2.2, 2.2],
  "decor.rug-long": [3.4, 2],
  "decor.rug-runner": [4, 1.1],
};
/** Door frames between rooms stand taller than the partitions, so a doorway reads from the town. */
const DOOR_FRAME = 1.05;
/** Floors with a character of their own; the other rooms keep the studio's cream cells. */
const FLOOR_VARIANT: Partial<Record<RoomKind, string>> = {
  lobby: "tile",
  "lead-office": "wood",
  // Neighbours never share a tone: the meeting room's dark oak beside the lead's light wood, planning's oak beside
  // storage's concrete, review's sage tiles between planning and dispatch, the analysts' cool cells beside the workers'.
  meeting: "oak",
  planning: "oak",
  review: "sage",
  design: "sage",
  analyst: "mist",
  storage: "concrete",
  dispatch: "concrete",
};
/** Ivy on an archived building, building cells: the back wall's outer face, the front corners. */
const IVY: { x: number; z: number; width: number; height: number; rotation: number }[] = [
  { x: -0.15, z: 5, width: 2.2, height: 1.5, rotation: -Math.PI / 2 },
  { x: -0.15, z: 19, width: 1.6, height: 1.2, rotation: -Math.PI / 2 },
  { x: 7.5, z: DEPTH + 0.15, width: 1.4, height: 0.5, rotation: 0 },
  { x: 19, z: DEPTH + 0.15, width: 1.2, height: 0.45, rotation: 0 },
];

export interface BuildingContext {
  style: ResolvedStyle;
  /** The cast whose figures stand for this building's agents (`setCast` swaps it live). */
  cast: Cast;
  /** Source time now (ms). */
  now: () => number;
  reducedMotion: () => boolean;
  /** The walk runtime's interpolated position of an agent, when it has one (walks.ts). */
  walker: (key: string) => Walker | undefined;
}

export type Pick = { kind: "agent"; key: string } | { kind: "object"; ticketId: string } | { kind: "room"; room: RoomKind } | { kind: "prop"; id: string };

interface Robot {
  handle: FigureHandle;
  signature: string;
  /** A real avatar follows its walker; a proxy stays still at its home place. */
  real: boolean;
  /** What the figure state is derived from (figureState.ts); its walker is read each frame. */
  agent: AgentPlacement;
  deskWaiting: boolean;
  /** Gone from the model but still walking out of the front door. */
  departing: boolean;
}

const surfaceHeights = new WeakMap<ResolvedStyle, Record<Surface, number>>();

function surfacesOf(style: ResolvedStyle): Record<Surface, number> {
  let s = surfaceHeights.get(style);
  if (!s) {
    const top = (key: ModelKey, scale = 1) => {
      const object = style.model(key);
      if (typeof object.userData.surface === "number") return object.userData.surface * scale;
      return new THREE.Box3().setFromObject(object).max.y * scale;
    };
    s = {
      floor: 0.02,
      rack: top("furniture.rack"),
      table: top("furniture.planning-table"),
      pile: top("furniture.review-pile") * 0.6,
      pallet: top("furniture.pallet"),
      desk: top("furniture.workdesk"),
      "lead-desk": top("furniture.lead-desk"),
    };
    surfaceHeights.set(style, s);
  }
  return s;
}

export class BuildingView {
  readonly group = new THREE.Group();
  readonly anchors = new Map<string, THREE.Vector3>();
  readonly ctx: BuildingContext;
  building: Building;
  template: BuildingTemplate;
  desks = new Map<string, DeskSlot>();
  layout: ObjectLayout = { placements: new Map(), targets: new Map(), pallets: [] };
  detailed = false;
  /** Counts shell rebuilds, so the town knows when to gather the window spots again. */
  shellRevision = 0;
  /** Bumps whenever something that casts a shadow seen from the town changed: the town then redraws its shadow map. */
  shadowRevision = 0;
  #shell = new THREE.Group();
  /** The static parts of the shell (walls, flag, emblem, signs), batched per material. */
  #shellStatic = new THREE.Group();
  /**
   * The tall back walls, merged on their own, each with a low stand-in: when the camera turns to look from the north
   * or the west, that side's tall wall gives way to its low rim so the rooms stay in view (#seesInside).
   */
  #backWalls = {
    north: { tall: new THREE.Group(), low: new THREE.Group() },
    west: { tall: new THREE.Group(), low: new THREE.Group() },
  };
  #merged: THREE.BufferGeometry[] = [];
  #pilesMerged: THREE.BufferGeometry[] = [];
  /** Pendant cords, shown only with a room in focus. */
  #cords = new THREE.Group();
  #cordsMerged: THREE.BufferGeometry[] = [];
  /** The entered building's personal desk things (roomDressing.ts `deskItems`). */
  #personal = new THREE.Group();
  #personalMerged: THREE.BufferGeometry[] = [];
  #signalsMerged: THREE.BufferGeometry[] = [];
  #furnitureMerged: THREE.BufferGeometry[] = [];
  #furniture: THREE.Group | null = null;
  /** The furniture layer's pieces hung on the tall north and west walls (they hide with their wall). */
  #wallDecor: Record<WallFace, THREE.Group> | null = null;
  /** Seen from the town: the furniture and dressing as a few merged boxes, so every building looks furnished. */
  #silhouette = new THREE.Group();
  #silhouetteMerged: THREE.BufferGeometry[] = [];
  #silhouetteSignature = "";
  #piles = new THREE.Group();
  #signals = new THREE.Group();
  #agents = new THREE.Group();
  #robots = new Map<string, Robot>();
  /** The facts of the figure being followed (reused every frame). */
  #facts: FigureFacts = { agent: null as unknown as AgentPlacement };
  #objects: ObjectLayer;
  #props: PropLayer;
  /** The town document's placements resolved into this building's rooms, and what they were resolved from. */
  placements: BuildingPlacements = { rooms: new Map(), errors: [] };
  #placementsFrom: { doc: unknown; definitions: unknown; shape: string } = { doc: null, definitions: null, shape: "" };
  #truck: THREE.Object3D | null = null;
  #truckHome = new THREE.Vector3();
  /** Where flights to the truck set their package down (building-local). */
  readonly #truckTarget = new THREE.Vector3();
  #truckDrive: { t: number } | null = null;
  #truckPending = false;
  #focus: THREE.Object3D | null = null;
  /** The rooms' layout signature of the last update: an interior built for another one is stale. */
  #shape = "";
  /** An interior build spread over idle time, and the layout it is for. */
  #pending: { steps: Generator<void, void>; shape: string } | null = null;
  #signatures = { shell: "", furniture: "", piles: "", signals: "", personal: "" };
  #yielded = "";
  #archivedCount: number;

  constructor(building: Building, centre: { x: number; z: number }, plotSize: number, ctx: BuildingContext) {
    this.ctx = ctx;
    this.building = building;
    this.template = buildingTemplate(building);
    this.#archivedCount = building.archivedCount;
    // The north-west corner never moves: role rooms grow east inside the reserved plot.
    // The floors stand on the slab, FLOOR_RISE above the lawn.
    this.group.position.set(centre.x - (MAX_WIDTH * CELL) / 2, 0.17 + FLOOR_RISE, centre.z - plotSize / 2 + PLOT_MARGIN);
    this.#objects = new ObjectLayer(building.slug, {
      style: ctx.style,
      now: ctx.now,
      reducedMotion: ctx.reducedMotion,
      truck: this.#truckTarget,
      surface: (s) => surfacesOf(ctx.style)[s],
    });
    this.#props = new PropLayer({
      style: ctx.style,
      slug: building.slug,
      reducedMotion: ctx.reducedMotion,
      surface: (s) => surfacesOf(ctx.style)[s],
      toWorld: (v) => v.add(this.group.position),
    });
    const back = this.#backWalls;
    this.group.add(back.north.tall, back.north.low, back.west.tall, back.west.low, this.#silhouette);
    this.group.add(this.#shell, this.#shellStatic, this.#piles, this.#agents, this.#signals, this.#personal, this.#objects.group, this.#props.group);
  }

  /** Building cells to building-local world units. */
  local(x: number, z: number, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(x * CELL, y, z * CELL);
  }
  world(x: number, z: number, y = 0): THREE.Vector3 {
    return this.local(x, z, y).add(this.group.position);
  }

  update(building: Building, detailed: boolean, town: TownLayer | null = null) {
    this.building = building;
    this.template = buildingTemplate(building);
    this.desks = assignDesks(building, this.template);
    this.layout = placeObjects(building, this.template, this.desks);
    const shape = JSON.stringify(this.template.rooms.map((r) => [r.kind, r.origin, r.layout.grid.width, r.layout.grid.depth]));
    const shell = `${shape}|${building.rooms.map((r) => `${r.kind}${r.present}`).join()}|${building.archived}|${building.color}|${building.icon}`;
    if (shell !== this.#signatures.shell) {
      this.#signatures.shell = shell;
      this.#buildShell();
    }
    this.detailed = detailed && !building.archived;
    this.#shape = shape;
    if (this.detailed) this.prepareInterior();
    if (this.#furniture) this.#furniture.visible = this.detailed;
    this.#cords.visible = this.detailed && this.#focusRoom !== null;
    this.#syncAgents();
    this.#syncPiles();
    this.#piles.visible = !this.detailed;
    this.#syncSilhouette(shape);
    this.#signals.visible = this.detailed;
    this.#personal.visible = this.detailed;
    this.#objects.group.visible = this.detailed;
    if (this.detailed) {
      this.#syncSignals();
      this.#syncPersonal();
      this.#objects.sync(building, this.layout);
      for (const [id, v] of this.#objects.anchors) this.anchors.set(id, v);
    }
    if (town) this.#syncTown(town, shape);
    if (building.archivedCount > this.#archivedCount) this.#truckPending = true;
    this.#archivedCount = building.archivedCount;
  }

  /* ── The town document: placed props, error crates, riders, rule props, build mode's ghost ─────────── */

  #syncTown(town: TownLayer, shape: string) {
    const from = this.#placementsFrom;
    if (from.doc !== town.doc || from.definitions !== town.definitions || from.shape !== shape) {
      this.placements = resolveBuildingPlacements(town.doc, this.building.slug, this.template, town.definitions);
      this.#placementsFrom = { doc: town.doc, definitions: town.definitions, shape };
      this.shadowRevision++;
      // Dressing that steps aside for a placed prop leaves the furniture layer.
      const yielded = [...this.placements.rooms.values()].flatMap((r) => r.yielded).join();
      if (yielded !== this.#yielded) {
        this.#yielded = yielded;
        this.cancelPrepare();
        if (this.#furniture) this.#buildFurniture();
      }
    }
    const riders = this.#props.sync({ building: this.building, template: this.template, placements: this.placements, desks: this.desks, town, detailed: this.detailed });
    if (this.detailed) this.#objects.setRiders(riders);
    for (const key of [...this.anchors.keys()]) if (/^(err|rule):/.test(key)) this.anchors.delete(key);
    for (const [key, v] of this.#props.anchors) this.anchors.set(key, v);
  }

  /** The room and room cell under a world point on the floor, or null outside the rooms. */
  cellAtWorld(point: THREE.Vector3): { room: RoomKind; cell: { x: number; z: number } } | null {
    return cellAt(this.template, (point.x - this.group.position.x) / CELL, (point.z - this.group.position.z) / CELL);
  }

  /* ── Shell: slab, floors, walls, doors, flag, emblem, room signs, the truck's apron ─────────────── */

  #buildShell() {
    this.shellRevision++;
    this.shadowRevision++;
    const { style } = this.ctx;
    this.#shell.clear();
    this.#shellStatic.clear();
    for (const side of Object.values(this.#backWalls)) for (const g of [side.tall, side.low]) g.clear();
    for (const g of this.#merged) g.dispose();
    const b = this.building;
    // An archived building keeps its colour out of the shell: muted sage and timber, never dark.
    const accent = b.archived ? null : ((b.color ?? null) as PaletteName | null);
    const variant = b.archived ? "archived" : undefined;
    const opt = (o: object) => (variant ? { ...o, variant } : o);
    const add = (object: THREE.Object3D, x: number, z: number, y = 0, rotation = 0) => {
      object.position.copy(this.local(x, z, y));
      object.rotation.y = rotation;
      this.#shellStatic.add(object);
      return object;
    };
    for (const room of this.template.rooms) {
      const { width, depth } = room.layout.grid;
      const present = b.rooms.find((r) => r.kind === room.kind)?.present ?? true;
      const cx = room.origin.x + width / 2,
        cz = room.origin.z + depth / 2;
      const look = b.archived || !present ? "dim" : FLOOR_VARIANT[room.kind];
      const floor = style.model("floor", { size: { width: width * CELL, height: 0, depth: depth * CELL }, ...(look ? { variant: look } : {}) });
      floor.position.copy(this.local(cx, cz, 0.02));
      // Drawn from the static batch (one mesh per floor material); the room-tagged original stays as the pick target,
      // with a material the renderer skips (the object itself stays visible, which picking asks for).
      this.#shellStatic.add(floor.clone());
      floor.traverse((o) => {
        o.userData.room = room.kind;
        if (o instanceof THREE.Mesh) o.material = PICK_ONLY;
      });
      this.#shell.add(floor);
      // Soft contact shade where the walls meet this room's floor.
      add(style.model("building.floor-shade", { size: { width: width * CELL, height: 0, depth: depth * CELL } }), cx, cz, 0.026);
      add(style.model("building.slab", opt({ size: { width: width * CELL, height: FLOOR_RISE, depth: depth * CELL }, accent })), cx, cz);
      const at = this.#signSpot(room.kind);
      add(style.model("room.sign"), at.x, at.z, 0.02);
      this.anchors.set(`r:${b.slug}:${room.kind}`, this.world(at.x, at.z, 0.35));
    }
    // North and west are the tall back walls (the glass wall and the chalk wall), south and east low rims to look in
    // over, and the partitions between rooms in between.
    for (const run of wallRuns(this.template)) {
      const horizontal = run.z1 === run.z2;
      const length = (horizontal ? run.x2 - run.x1 : run.z2 - run.z1) * CELL;
      const [key, height, depth] = WALLS[run.side];
      const wall = add(style.model(key, opt({ size: { width: length + depth, height, depth } })), (run.x1 + run.x2) / 2, (run.z1 + run.z2) / 2, 0, horizontal ? 0 : Math.PI / 2);
      if (run.side === "north" || run.side === "west") {
        const [lowKey, lowHeight, lowDepth] = WALLS.south;
        const low = style.model(lowKey, opt({ size: { width: length + lowDepth, height: lowHeight, depth: lowDepth } }));
        low.position.copy(wall.position);
        low.rotation.y = wall.rotation.y;
        this.#backWalls[run.side].tall.add(wall);
        this.#backWalls[run.side].low.add(low);
      }
    }
    for (const opening of doorOpenings(this.template)) {
      const horizontal = opening.z1 === opening.z2;
      const width = (horizontal ? opening.x2 - opening.x1 : opening.z2 - opening.z1) * CELL;
      const x = (opening.x1 + opening.x2) / 2,
        z = (opening.z1 + opening.z2) / 2;
      const rotation = horizontal ? 0 : Math.PI / 2;
      if (opening.id === "entrance") {
        add(style.model("door", opt({ size: { width, height: FLOOR_RISE, depth: 0.16 }, accent })), x, z, 0, rotation);
        // A wall lamp on the portal's east post, and a bike leaning on the lawn beside the planter.
        this.#outside(style.model("building.wall-lamp", opt({})), x + width / CELL / 2 + 0.3, z + 0.18, 0);
        // A small detail: it takes shadows but casts none.
        if (!b.archived) this.#outside(noShadow(style.model("building.bike")), x - width / CELL / 2 - 2.4, z + 0.9, -FLOOR_RISE, 0.25, 0.12);
        // The building's name on a painted board over the door; an archived building shows only its closed sign.
        if (!b.archived) add(style.model("building.name-sign", { accent, text: b.name, size: { width, height: 0.3, depth: 0.06 } }), x, z, 0, rotation);
        // The closed sign hangs from the awning's front edge.
        if (b.archived) add(style.model("building.closed-sign"), x, z + 1.15, 1.4);
      } else if (opening.id === "loading") {
        add(style.model("building.loading-door", opt({ size: { width, height: 1.2, depth: 0.16 } })), x, z, 0, rotation);
        this.#outside(style.model("building.wall-lamp", opt({})), x + width / CELL / 2 + 0.25, z + 0.2, 0);
      }
      else add(style.model("building.door-frame", opt({ size: { width, height: DOOR_FRAME, depth: 0.14 } })), x, z, 0, rotation);
    }
    // Outside, on the lawn: the flag at the north-west corner, the emblem by the path, the truck's apron.
    add(style.model("building.flag", opt({ accent })), -0.6, -0.6, -FLOOR_RISE);
    if (b.icon) add(style.model(`emblem.${b.icon as EmblemName}`, { accent }), ENTRANCE.x + 4, DEPTH + 1.6, -FLOOR_RISE);
    const apron = { x: (LOADING.x1 + LOADING.x2) / 2, z: DEPTH + 2.4 };
    add(style.model("building.apron", { size: { width: (LOADING.x2 - LOADING.x1 + 2) * CELL, height: FLOOR_RISE, depth: 4 * CELL } }), apron.x, apron.z);
    if (b.archived) {
      // Boarded up but still pretty: ivy on the back wall and up the front corners.
      IVY.forEach((spot, i) => {
        const ivy = add(style.model("building.ivy", { size: { width: spot.width, height: spot.height, depth: 0.1 }, seed: i + 1 }), spot.x, spot.z, 0, spot.rotation);
        // Ivy up the back wall comes and goes with that wall when the camera turns.
        if (spot.x < 0) this.#backWalls.west.tall.add(ivy);
      });
      // Closed, not unfinished: the furniture under dust sheets, chairs stacked for the move, a few crates.
      this.template.rooms.forEach((room, i) => {
        const { width, depth } = room.layout.grid;
        if (width < 4 || depth < 3) return;
        const { x, z } = room.origin;
        add(style.model("building.dust-sheet"), x + width * 0.42, z + 1.3, 0.02, (i % 3) * 0.08 - 0.08);
        if (width >= 6) add(style.model("building.chair-stack"), x + width - 1.2, z + 1.1, 0.02, i * 0.7);
        if (depth >= 5) add(style.model("building.dust-sheet"), x + 1.8, z + depth - 1.6, 0.02, Math.PI / 2 + 0.05);
        if (i % 2 === 0 && width >= 5 && depth >= 4) {
          add(style.model("crate"), x + width - 1.1, z + depth - 1.1, 0.02, 0.3 + i);
          add(style.model("crate"), x + width - 1.9, z + depth - 1, 0.02, -0.2 + i);
          add(style.model("crate"), x + width - 1.4, z + depth - 1.05, 0.34, 0.6 + i);
        }
      });
    }
    // The truck backs up to dispatch's loading door, nose to the street, ready to drive off the plot.
    if (!b.archived) {
      this.#truck = style.model("truck", { accent });
      this.#truckHome.copy(this.local(TRUCK_SPOT.x, TRUCK_SPOT.z, -FLOOR_RISE));
      this.#truck.position.copy(this.#truckHome);
      this.#truck.rotation.y = -Math.PI / 2;
      this.#truck.scale.setScalar(0.85);
      this.#shell.add(this.#truck);
      this.#truckTarget.copy(this.#truckHome).setY(0.55 - FLOOR_RISE);
    } else this.#truck = null;
    this.anchors.set(`truck:${b.slug}`, this.world(TRUCK_SPOT.x, TRUCK_SPOT.z, 1 - FLOOR_RISE));
    this.#merged = mergeStatic(this.#shellStatic);
    // The truck moves only as a whole: its parts merge per material under its own root (perf). It can be picked, so
    // its merged geometry keeps its vertex data for the raycast.
    if (this.#truck) this.#merged.push(...mergeStatic(this.#truck as THREE.Group, { keepData: true }));
    for (const [side, walls] of Object.entries(this.#backWalls) as ["north" | "west", { tall: THREE.Group; low: THREE.Group }][])
      for (const tall of [true, false]) {
        const group = tall ? walls.tall : walls.low;
        this.#merged.push(...mergeStatic(group));
        for (const mesh of group.children) {
          // The low stand-in is a rim: its shadow is lost under the slab's lip anyway.
          if (!tall) mesh.castShadow = false;
          // The frame a rotation crosses a side, the wrong variant is still visible: it collapses for that draw.
          mesh.onBeforeRender = (_renderer, _scene, camera) => {
            if (this.#seesInside(side, camera) === tall) return;
            mesh.matrixWorld.makeScale(0, 0, 0);
            // The matrix pass recomputes only what changed (matrixPass.ts): restore it next frame.
            mesh.matrixWorldNeedsUpdate = true;
          };
        }
      }
    // Each draw of the shell sets which variant the next frames draw, so only one of them costs draw calls.
    const probe = this.#shellStatic.children.find((c) => c instanceof THREE.Mesh);
    if (probe)
      probe.onBeforeRender = (_renderer, _scene, camera) => {
        for (const [side, walls] of Object.entries(this.#backWalls) as ["north" | "west", { tall: THREE.Group; low: THREE.Group }][]) {
          const inside = this.#seesInside(side, camera);
          walls.tall.visible = inside;
          walls.low.visible = !inside;
          if (this.#wallDecor) {
            this.#wallDecor[side].visible = inside;
            // A partition's other face, the one a room's south or east edge carries, shows from the far side.
            this.#wallDecor[side === "north" ? "south" : "east"].visible = !inside;
          }
        }
      };
    for (const walls of Object.values(this.#backWalls)) walls.low.visible = false;
    this.#applyFocus();
  }

  /** Adds a piece by the doors to the static batch, at building cells with a yaw and a sideways lean (its light pool
   *  decal stays unbatched). */
  #outside(object: THREE.Object3D, x: number, z: number, y: number, rotation = 0, lean = 0): THREE.Object3D {
    object.position.copy(this.local(x, z, y));
    object.rotation.set(lean, rotation, 0, "YXZ");
    this.#shellStatic.add(object);
    return object;
  }

  /** The tall back wall a decor piece hangs on, if any: a wall piece set against a north or west outer run. */
  #mountedOn(item: DecorItem): "north" | "west" | null {
    if (item.on !== "floor" || !WALL_HUNG.some((k) => item.key.startsWith(k))) return null;
    for (const run of wallRuns(this.template)) {
      if (run.side === "north" && Math.abs(item.z - 0.5 - run.z1) < 0.01 && item.x > run.x1 && item.x < run.x2) return "north";
      if (run.side === "west" && Math.abs(item.x - 0.5 - run.x1) < 0.01 && item.z > run.z1 && item.z < run.z2) return "west";
    }
    return null;
  }

  /** True when the camera looks at a back wall's inner face (from the south and east, as at home). */
  #seesInside(side: "north" | "west", camera: THREE.Camera): boolean {
    const o = this.group.position;
    return side === "north" ? camera.position.z > o.z + (DEPTH * CELL) / 2 : camera.position.x > o.x + (this.template.size.width * CELL) / 2;
  }

  #signSpot(kind: RoomKind): { x: number; z: number } {
    const room = roomOf(this.template, kind)!;
    return { x: room.origin.x + 1.1, z: room.origin.z + room.layout.grid.depth - 0.45 };
  }

  /* The furniture layer: the template's furniture with its blocking dressing, and the dressing that never blocks
     (roomDressing.ts). Static, so it is batched per material; only the entered building draws it. */
  /** Builds the interior at once (an entered building, or a placed prop that changed what the dressing yields). */
  #buildFurniture() {
    this.cancelPrepare();
    for (const _ of this.#furnitureSteps());
  }

  /**
   * The interior build in steps (the furniture's models, the decor's, then each merge), so the town can spread it over
   * idle time. Nothing joins the scene before the last step swaps it in; a build given up disposes what it merged.
   */
  *#furnitureSteps(): Generator<void, void> {
    const { style } = this.ctx;
    const g = new THREE.Group();
    const yielded = (kind: RoomKind) => this.placements.rooms.get(kind)?.yielded ?? [];
    for (const room of this.template.rooms)
      for (const prop of room.layout.props) {
        const def = prop.definitionId;
        const definition = interiorDefinitions[def];
        if (!definition || yielded(room.kind).includes(prop.id)) continue;
        const dressing = prop.id.startsWith(DRESS_PREFIX);
        const model = style.model(`furniture.${def}`, { seed: dressing ? dressingSeed(prop.id) % 97 : prop.id.length });
        const pose = footprintPose(definition, prop.cell, prop.rotation);
        model.position.copy(this.local(room.origin.x + pose.x, room.origin.z + pose.z, 0.02));
        model.rotation.y = pose.rotationY;
        // Desks face their seat to the north, so the agent looks over the desk towards the camera.
        if (def === "workdesk" || def === "lead-desk") model.rotation.y = Math.PI;
        if (def === "plant") model.scale.setScalar(dressing ? ROBOT_SCALE * (0.8 + (dressingSeed(prop.id) % 5) * 0.08) : ROBOT_SCALE);
        if (def === "bench" || def === "coffee-machine") model.scale.setScalar(0.7);
        g.add(model);
      }
    yield;
    const wallDecor: Record<WallFace, THREE.Group> = { north: new THREE.Group(), west: new THREE.Group(), south: new THREE.Group(), east: new THREE.Group() };
    // Pendant cords and ceiling roses read as posts from the building camera: they draw only with a room in focus.
    const cords = new THREE.Group();
    for (const item of roomDecor(this.template, { definitions: interiorDefinitions, seed: dressingSeed(this.building.slug), zones: dressingZones(this.template), loading: LOADING, piles: PILE_ROOMS })) {
      const side = item.wall ?? this.#mountedOn(item);
      (item.key === "decor.pendant-cord" ? cords : side ? wallDecor[side] : g).add(this.#decor(item));
    }
    yield;
    let cordsMerged: THREE.BufferGeometry[] = [];
    const merged: THREE.BufferGeometry[] = [];
    let swapped = false;
    try {
      cordsMerged = mergeStatic(cords);
      merged.push(...mergeStatic(g));
      yield;
      // Pieces hung on a tall back wall come and go with that wall when the camera turns (#seesInside); art on a
      // partition shows only on the face turned to the camera.
      for (const side of ["north", "west", "south", "east"] as const) {
        g.add(wallDecor[side]);
        merged.push(...mergeStatic(wallDecor[side]));
        const wall = side === "south" ? "north" : side === "east" ? "west" : side;
        const facing = side === wall;
        for (const mesh of wallDecor[side].children)
          mesh.onBeforeRender = (_renderer, _scene, camera) => {
            if (this.#seesInside(wall, camera) === facing) return;
            mesh.matrixWorld.makeScale(0, 0, 0);
            mesh.matrixWorldNeedsUpdate = true; // restored by the next matrix pass (matrixPass.ts)
          };
      }
      // Swap the new interior in.
      this.shadowRevision++;
      this.#furniture?.removeFromParent();
      this.#cords.removeFromParent();
      for (const geometry of [...this.#furnitureMerged, ...this.#cordsMerged]) geometry.dispose();
      this.#cords = cords;
      this.#cords.visible = this.detailed && this.#focusRoom !== null;
      this.#cordsMerged = cordsMerged;
      this.group.add(cords);
      g.visible = this.detailed;
      this.#furniture = g;
      this.#furnitureMerged = merged;
      this.#wallDecor = wallDecor;
      this.group.add(g);
      swapped = true;
    } finally {
      if (!swapped) for (const geometry of [...cordsMerged, ...merged]) geometry.dispose();
    }
  }



  /** True while the building holds a built interior (shown or kept for the next visit). */
  get hasInterior(): boolean {
    return this.#furniture !== null;
  }

  /**
   * Builds the interior (the furniture layer with its decor) for the current layout unless it is built already; true
   * when this call finished it. The town calls it ahead, in idle time, for the building the visitor is about to enter,
   * so the enter itself only shows it: with `more`, it stops between steps once `more()` says no and goes on at the next
   * call. Hidden until the building is entered.
   */
  prepareInterior(more: () => boolean = () => true): boolean {
    if (this.building.archived) return false;
    if (this.#pending && this.#pending.shape !== this.#shape) this.cancelPrepare();
    if (!this.#pending) {
      if (this.#shape === this.#signatures.furniture) return false;
      this.#pending = { steps: this.#furnitureSteps(), shape: this.#shape };
    }
    const pending = this.#pending;
    do {
      if (pending.steps.next().done) {
        this.#pending = null;
        this.#signatures.furniture = pending.shape;
        return true;
      }
    } while (more());
    return false;
  }

  /** True while an interior build waits for its next step. */
  get preparing(): boolean {
    return this.#pending !== null;
  }

  /** Gives up an interior build in progress (the visitor moved on, or the layout changed). */
  cancelPrepare() {
    this.#pending?.steps.return();
    this.#pending = null;
  }

  /** Drops the interior: its furniture, decor, desk things and signals, rebuilt on the next visit. The town keeps
   *  only the few most recently used interiors, so visiting building after building does not pile up geometry. */
  releaseInterior() {
    if (this.detailed) return;
    this.cancelPrepare();
    if (!this.#furniture) return;
    this.#furniture.removeFromParent();
    this.#furniture = null;
    this.#wallDecor = null;
    this.#cords.removeFromParent();
    this.#cords = new THREE.Group();
    this.#personal.clear();
    this.#signals.clear();
    for (const geometry of [...this.#furnitureMerged, ...this.#cordsMerged, ...this.#personalMerged, ...this.#signalsMerged]) geometry.dispose();
    this.#furnitureMerged = [];
    this.#cordsMerged = [];
    this.#personalMerged = [];
    this.#signalsMerged = [];
    this.#signatures.furniture = this.#signatures.personal = this.#signatures.signals = "";
  }

  #decor(item: DecorItem): THREE.Object3D {
    const surfaces = surfacesOf(this.ctx.style);
    const model = this.ctx.style.model(item.key);
    const y = item.on === "floor" ? 0.02 : surfaces[item.on] + 0.01;
    model.position.copy(this.local(item.x, item.z, y + (item.raise ?? 0)));
    model.rotation.y = item.rotation;
    if (item.scale) model.scale.set(item.scale.x, item.scale.y, item.scale.z);
    return model;
  }

  /** Each desk's personal things, seeded by who sits there; merged per material, rebuilt when the seating changes. */
  #syncPersonal() {
    const signature = [...this.desks.values()].map((d) => `${d.agentKey}@${d.propId}${d.room}`).join("|");
    if (signature === this.#signatures.personal) return;
    this.#signatures.personal = signature;
    this.#personal.clear();
    for (const geometry of this.#personalMerged) geometry.dispose();
    for (const item of deskItems(this.desks.values())) this.#personal.add(this.#decor(item));
    this.#personalMerged = mergeStatic(this.#personal);
  }

  /* The far-detail furniture: every furniture and dressing piece, and the rugs, as the style's plain stand-in boxes,
     batched per material (a handful of draw calls per building). Rebuilt only when the rooms' furniture changes. */
  #syncSilhouette(shape: string) {
    const far = !this.detailed && !this.building.archived;
    this.#silhouette.visible = far;
    if (!far) return;
    // Cheap: it runs on every model update of every building. The dressing follows the shape; a placed prop that
    // makes dressing step aside changes a room's prop count.
    let signature = shape;
    for (const room of this.template.rooms) signature += `|${room.layout.props.length}`;
    if (signature === this.#silhouetteSignature) return;
    this.#silhouetteSignature = signature;
    this.shadowRevision++;
    const { style } = this.ctx;
    const g = this.#silhouette;
    g.clear();
    for (const geometry of this.#silhouetteMerged) geometry.dispose();
    for (const room of this.template.rooms)
      for (const prop of room.layout.props) {
        const definition = interiorDefinitions[prop.definitionId];
        const kind = FAR_FURNITURE[prop.definitionId];
        if (!definition || !kind) continue;
        const { width, depth } = definition.footprint;
        const model = style.model("building.silhouette", { size: { width: width * CELL, height: 0, depth: depth * CELL }, variant: kind });
        const pose = footprintPose(definition, prop.cell, prop.rotation);
        model.position.copy(this.local(room.origin.x + pose.x, room.origin.z + pose.z, 0.02));
        model.rotation.y = prop.definitionId === "workdesk" || prop.definitionId === "lead-desk" ? Math.PI : pose.rotationY;
        g.add(model);
      }
    for (const item of roomDecor(this.template, { definitions: interiorDefinitions, seed: dressingSeed(this.building.slug), zones: dressingZones(this.template), loading: LOADING, piles: PILE_ROOMS })) {
      const rug = FAR_RUGS[item.key];
      if (!rug) continue;
      const model = style.model("building.silhouette", { size: { width: rug[0] * CELL, height: 0, depth: rug[1] * CELL }, variant: "rug" });
      model.position.copy(this.local(item.x, item.z, 0.02));
      model.rotation.y = item.rotation;
      g.add(model);
    }
    this.#silhouetteMerged = mergeStatic(g);
  }

  /* ── Agents ─────────────────────────────────────────────────────────────── */

  #syncAgents() {
    const b = this.building;
    const seen = new Set<string>();
    const loose = new Map<RoomKind, number>();
    for (const agent of b.archived ? [] : b.agents) {
      seen.add(agent.key);
      const role = figureRole(agent, "building");
      // Every figure of a project gets its colour; the cast decides who wears it (the classic bots: the lead).
      const accent = (b.color ?? null) as PaletteName | null;
      const signature = `${this.ctx.cast.manifest.id}|${role}|${accent}`;
      let robot = this.#robots.get(agent.key);
      if (!robot || robot.signature !== signature) {
        robot?.handle.dispose();
        robot = { handle: this.#figure(agent.key, role, accent), signature, real: false, agent, deskWaiting: false, departing: false };
        this.#robots.set(agent.key, robot);
      }
      robot.real = agent.presence === "real";
      robot.agent = agent;
      robot.deskWaiting = agent.deskTicketKey !== null && b.objects.some((o) => o.key === agent.deskTicketKey && o.waitingOnHuman);
      // Seen from the town, a figure is a few pixels tall: the cast drops its small parts and shadows.
      robot.handle.setDetail(this.detailed ? "near" : "far");
      robot.departing = false;
      const seat = this.desks.get(agent.key)?.seat ?? this.#looseSpot(agent, loose);
      robot.handle.object.position.copy(this.local(seat.x + 0.5, seat.z + 0.5, FLOOR_LIFT));
      robot.handle.object.rotation.y = 0;
      robot.handle.setState(figureState(robot));
      const head = FLOOR_LIFT + robot.handle.anchors.label[1] * ROBOT_SCALE;
      const anchor = this.anchors.get(`a:${b.slug}:${agent.key}`);
      if (anchor) anchor.copy(this.world(seat.x + 0.5, seat.z + 0.5, head));
      else this.anchors.set(`a:${b.slug}:${agent.key}`, this.world(seat.x + 0.5, seat.z + 0.5, head));
      this.#follow(agent.key, robot);
    }
    for (const [key, robot] of this.#robots)
      if (!seen.has(key)) {
        // A worker that left the snapshot keeps its figure until it is out of the door.
        const walker = this.ctx.walker(key);
        if (robot.real && walker?.leaving && walker.building === b.slug) {
          if (!robot.departing) {
            robot.departing = true;
            robot.agent = { ...robot.agent, alerts: [] };
            robot.deskWaiting = false;
          }
          // A cast swapped while it walks out: it leaves as the new cast.
          if (!robot.signature.startsWith(`${this.ctx.cast.manifest.id}|`)) {
            const [, role, accent] = robot.signature.split("|") as [string, CastRole, string];
            const at = robot.handle.object;
            robot.handle.dispose();
            robot.handle = this.#figure(key, role, accent === "null" ? null : (accent as PaletteName));
            robot.handle.object.position.copy(at.position);
            robot.handle.object.rotation.y = at.rotation.y;
            robot.handle.setDetail(this.detailed ? "near" : "far");
            robot.signature = `${this.ctx.cast.manifest.id}|${role}|${accent}`;
          }
          this.#follow(key, robot);
          this.anchors.delete(`a:${b.slug}:${key}`);
          continue;
        }
        this.#dropRobot(key, robot);
      }
  }

  /** A figure of the building's cast, at the interiors' scale, pickable as its agent. */
  #figure(key: string, role: CastRole, accent: PaletteName | null): FigureHandle {
    const handle = this.ctx.cast.figure({ key, role, accent });
    handle.object.scale.setScalar(ROBOT_SCALE);
    handle.object.traverse((o) => {
      o.userData.agentId = key;
    });
    this.#agents.add(handle.object);
    return handle;
  }

  /** Another cast for this building: every figure is swapped in place, where it stands or walks. */
  setCast(cast: Cast) {
    if (cast === this.ctx.cast) return;
    this.ctx.cast = cast;
    this.#syncAgents();
    this.#placeSelection();
  }

  #dropRobot(key: string, robot: Robot) {
    robot.handle.dispose();
    this.#robots.delete(key);
    this.anchors.delete(`a:${this.building.slug}:${key}`);
  }

  /** Puts a real avatar where its walker is (world units), facing its way, walking or in its posture. */
  #follow(key: string, robot: Robot): boolean {
    const walker = robot.real ? this.ctx.walker(key) : undefined;
    if (!walker || walker.building !== this.building.slug) return false;
    const o = this.group.position;
    robot.handle.object.position.set(walker.x - o.x, walker.y - o.y + FLOOR_LIFT, walker.z - o.z);
    robot.handle.object.rotation.y = walker.heading;
    this.#facts.agent = robot.agent;
    this.#facts.deskWaiting = robot.deskWaiting;
    this.#facts.walker = walker;
    robot.handle.setState(figureState(this.#facts));
    this.anchors.get(`a:${this.building.slug}:${key}`)?.set(walker.x, walker.y + 2 * FLOOR_LIFT + robot.handle.anchors.label[1] * ROBOT_SCALE, walker.z);
    return walker.walking;
  }

  /** An agent past its room's desks stands near the room's middle. */
  #looseSpot(agent: AgentPlacement, loose: Map<RoomKind, number>) {
    const room = agent.room ? roomOf(this.template, agent.room) : undefined;
    const n = loose.get(agent.room ?? "lobby") ?? 0;
    loose.set(agent.room ?? "lobby", n + 1);
    if (!room) return { x: ENTRANCE.x - 2 + n, z: DEPTH - 2 };
    return { x: room.origin.x + 0.2 + (n % Math.max(1, room.layout.grid.width - 1)), z: room.origin.z + room.layout.grid.depth - 1.2 };
  }

  /* ── Pile heights (town view) ───────────────────────────────────────────── */

  #syncPiles() {
    const counts = STATUS_ROOMS.map((kind) => this.building.objects.filter((o) => o.room === kind).length);
    const signature = counts.join();
    if (signature === this.#signatures.piles) return;
    this.#signatures.piles = signature;
    this.shadowRevision++;
    this.#piles.clear();
    for (const geometry of this.#pilesMerged) geometry.dispose();
    STATUS_ROOMS.forEach((kind, i) => {
      const count = counts[i]!;
      const room = roomOf(this.template, kind);
      if (!count || !room) return;
      const pile = this.ctx.style.model("pallet");
      const c = roomCentre(room);
      pile.position.copy(this.local(c.x, c.z - 0.3, 0.02));
      // Height follows the pile: one wrapped layer per four tickets, capped so a big pile stays on its plot.
      pile.scale.set(1.2, Math.min(4, 0.35 + count / 4), 1.2);
      this.#piles.add(pile);
    });
    // Static until the counts change: one merged mesh per material instead of every pallet part (perf).
    this.#pilesMerged = mergeStatic(this.#piles);
  }

  /* ── Signals (entered building) ─────────────────────────────────────────── */

  #syncSignals() {
    const { style } = this.ctx;
    const b = this.building;
    const stalledDesks = new Map<string, string[]>();
    for (const o of b.objects) {
      if (o.stall?.state !== "stalled" || o.transit) continue;
      const slot = this.layout.placements.get(o.ticketId)?.slot;
      if (!slot) continue;
      stalledDesks.set(slot, [...(stalledDesks.get(slot) ?? []), o.ticketId]);
    }
    const published = b.releases.some((r) => r.publishedAt);
    const signature = JSON.stringify([
      [...this.desks.values()].map((d) => d.propId + d.room),
      [...stalledDesks],
      b.beacons.length,
      published,
      b.mailbox.map((l) => l.deliveryId),
      this.layout.pallets.map((p) => `${p.room}${p.count}`),
    ]);
    if (signature === this.#signatures.signals) return;
    this.#signatures.signals = signature;
    this.#signals.clear();
    for (const geometry of this.#signalsMerged) geometry.dispose();
    for (const key of [...this.anchors.keys()]) if (/^(c|beacon|banner|mail|p):/.test(key)) this.anchors.delete(key);
    // A lamp on every desk; a stalled ticket's desk dims its lamp and shows the quiet clock.
    for (const desk of this.desks.values()) {
      const slot = `desk:${desk.agentKey}`;
      const stalled = stalledDesks.get(slot) ?? (desk.agentKey === b.lead.id ? stalledDesks.get("inbox") : undefined);
      const lamp = style.model("desk-lamp", stalled ? { variant: "dim" } : {});
      const lead = desk.definitionId === "lead-desk";
      lamp.position.copy(this.local(desk.desk.x + (lead ? -1.1 : -0.7), desk.desk.z + 0.2, surfacesOf(style)[lead ? "lead-desk" : "desk"] + 0.02));
      this.#signals.add(lamp);
      if (stalled) {
        const clock = style.model("quiet-clock");
        clock.position.copy(this.local(desk.desk.x + (lead ? -0.4 : 0.2), desk.desk.z + 0.9, 0.02));
        this.#signals.add(clock);
        for (const id of stalled) this.anchors.set(`c:${b.slug}:${id}`, this.world(desk.desk.x + (lead ? -0.4 : 0.2), desk.desk.z + 0.9, 0.45));
      }
    }
    const office = roomOf(this.template, "lead-office");
    if (office && b.beacons.length) {
      const beacon = style.model("beacon");
      beacon.position.copy(this.local(office.origin.x + 1, office.origin.z + 0.8, 0.02));
      beacon.scale.setScalar(1.3);
      this.#signals.add(beacon);
      this.anchors.set(`beacon:${b.slug}`, this.world(office.origin.x + 1, office.origin.z + 0.8, 1.9));
    }
    // The trophy on the lead's desk is a rule prop (release-trophy), drawn by the prop layer.
    const lobby = roomOf(this.template, "lobby");
    if (lobby && published) {
      const banner = style.model("banner", { accent: (b.color ?? null) as PaletteName | null });
      banner.position.copy(this.local(lobby.origin.x + 5.2, lobby.origin.z + 1.0, 0.02));
      this.#signals.add(banner);
      this.anchors.set(`banner:${b.slug}`, this.world(lobby.origin.x + 5.2, lobby.origin.z + 1.0, 1.55));
    }
    if (lobby && b.mailbox.length) {
      b.mailbox.forEach((letter, i) => {
        const model = style.model(letter.flagged ? "letter.flagged" : "letter");
        model.position.copy(this.local(lobby.origin.x + 2.3 + (i % 3) * 0.45, lobby.origin.z + 5.6 + Math.floor(i / 3) * 0.4, 0.03));
        model.rotation.y = (i % 2 ? 0.2 : -0.15);
        this.#signals.add(model);
      });
      this.anchors.set(`mail:${b.slug}`, this.world(lobby.origin.x + 1.5, lobby.origin.z + 5.5, 1.2));
    }
    for (const pallet of this.layout.pallets) {
      const model = style.model("pallet");
      model.position.copy(this.local(pallet.x, pallet.z, 0.02));
      model.scale.setScalar(0.75);
      this.#signals.add(model);
      this.anchors.set(`p:${b.slug}:${pallet.room}`, this.world(pallet.x, pallet.z, 0.6));
    }
    // Static until the signature changes: one merged mesh per material instead of every lamp's parts (perf).
    this.#signalsMerged = mergeStatic(this.#signals);
  }

  /* ── Focus, motion, picking ─────────────────────────────────────────────── */

  #focusRoom: RoomKind | null = null;
  setFocus(kind: RoomKind | null) {
    if (kind === this.#focusRoom && this.#focus) return;
    this.#focusRoom = kind;
    this.#cords.visible = this.detailed && kind !== null;
    this.#applyFocus();
  }
  #applyFocus() {
    this.#focus?.removeFromParent();
    this.#focus = null;
    this.#focusFill?.removeFromParent();
    this.#focusFill = this.#fill(this.#focusRoom);
    const room = this.#focusRoom ? roomOf(this.template, this.#focusRoom) : undefined;
    if (!room) return;
    const { width, depth } = room.layout.grid;
    this.#focus = this.ctx.style.model("focus-ring", { size: { width: width * CELL - 0.1, height: 0, depth: depth * CELL - 0.1 } });
    this.#focus.position.copy(this.local(room.origin.x + width / 2, room.origin.z + depth / 2, 0.03));
    this.group.add(this.#focus);
  }

  /* A soft wash on the floor of the focused room and of the room under the pointer; a soft ring under the selected
     agent's feet that follows it. Static: they show the same under reduced motion. */
  #focusFill: THREE.Object3D | null = null;
  #hoverFill: THREE.Object3D | null = null;
  #hoverRoom: RoomKind | null = null;
  #selectedKey: string | null = null;
  #selection: THREE.Object3D | null = null;
  #fill(kind: RoomKind | null): THREE.Object3D | null {
    const room = kind ? roomOf(this.template, kind) : undefined;
    if (!room) return null;
    const { width, depth } = room.layout.grid;
    const fill = this.ctx.style.model("focus-fill", { size: { width: width * CELL, height: 0, depth: depth * CELL } });
    fill.position.copy(this.local(room.origin.x + width / 2, room.origin.z + depth / 2, 0.025));
    this.group.add(fill);
    return fill;
  }
  setHover(kind: RoomKind | null) {
    if (kind === this.#hoverRoom) return;
    this.#hoverRoom = kind;
    this.#hoverFill?.removeFromParent();
    this.#hoverFill = kind === this.#focusRoom ? null : this.#fill(kind);
  }
  setSelected(key: string | null) {
    if (key === this.#selectedKey) return;
    if (this.#selectedKey) this.#robots.get(this.#selectedKey)?.handle.setHighlight("none");
    this.#selectedKey = key;
    if (!key) {
      this.#selection?.removeFromParent();
      this.#selection = null;
      return;
    }
    if (!this.#selection) {
      this.#selection = this.ctx.style.model("selection-ring");
      this.group.add(this.#selection);
    }
    this.#placeSelection();
  }
  #placeSelection() {
    const ring = this.#selection;
    if (!ring) return;
    const robot = this.#selectedKey ? this.#robots.get(this.#selectedKey) : undefined;
    ring.visible = !!robot;
    if (robot) ring.scale.setScalar(robot.handle.anchors.ground / RING_GROUND);
    robot?.handle.setHighlight("selected");
    if (robot) ring.position.set(robot.handle.object.position.x, robot.handle.object.position.y + 0.01, robot.handle.object.position.z);
  }

  /** A figure of this building as the labels see it, in world units: from its label anchor down to its feet, and its ground radius. */
  get figureBox(): { height: number; half: number } | null {
    for (const robot of this.#robots.values()) {
      const anchors = robot.handle.anchors;
      return { height: anchors.label[1] * ROBOT_SCALE, half: anchors.ground * ROBOT_SCALE };
    }
    return null;
  }

  /** True while something here moves. */
  get animating(): boolean {
    const idle = !this.ctx.reducedMotion() && this.#robots.size > 0;
    return (this.detailed && (this.#objects.animating || this.#props.animating || idle)) || this.#truckDrive !== null || this.#truckPending;
  }

  /**
   * `seen` false: the building is off screen. Its robots then skip following their walkers; they catch up on the
   * first frame it is seen again.
   */
  tick(seconds: number, seen = true) {
    this.#placeSelection();
    const reduced = this.ctx.reducedMotion();
    const still = !seen && !this.detailed;
    for (const [key, robot] of this.#robots) {
      if (robot.departing && !this.ctx.walker(key)) {
        this.#dropRobot(key, robot);
        continue;
      }
      if (still) continue;
      const walking = this.#follow(key, robot);
      // Robots in a building seen from the town only animate while they walk.
      if (!reduced && (this.detailed || walking)) robot.handle.update(seconds);
    }
    if (this.detailed) {
      this.#objects.update(seconds);
      this.#props.tick(seconds);
      for (const child of this.#signals.children) (child.userData.animate as ((s: number) => void) | undefined)?.(seconds);
    }
    this.#driveTruck(seconds, reduced);
  }

  /** The truck leaves once every package bound for it has landed, then comes back. */
  #driveTruck(seconds: number, reduced: boolean) {
    const truck = this.#truck;
    if (!truck) {
      this.#truckPending = false;
      return;
    }
    if (this.#truckPending && !this.building.objects.some((o) => o.transit?.toRoom === "truck")) {
      this.#truckPending = false;
      this.#truckDrive = { t: 0 };
    }
    if (!this.#truckDrive) return;
    // The truck casts a shadow as it drives off and comes back.
    this.shadowRevision++;
    this.#truckDrive.t += seconds / TRUCK_S;
    const t = this.#truckDrive.t;
    if (reduced) {
      // Instant: gone for a moment, then back.
      truck.visible = t > 0.6;
    } else if (t < 0.55) {
      const u = t / 0.55;
      truck.position.copy(this.#truckHome).setZ(this.#truckHome.z + u * u * 4.5);
      this.ctx.style.materialise(truck, 1 - Math.max(0, (u - 0.6) / 0.4));
    } else {
      truck.position.copy(this.#truckHome);
      this.ctx.style.materialise(truck, Math.min(1, (t - 0.55) / 0.45));
    }
    if (t >= 1) {
      truck.visible = true;
      truck.position.copy(this.#truckHome);
      this.ctx.style.materialise(truck, 1);
      truck.scale.setScalar(0.85);
      this.#truckDrive = null;
    }
    if (!reduced && this.#truckDrive) truck.scale.multiplyScalar(0.85);
  }

  /** Seen from the town: hands the robots to the town's crowd, which draws them instanced (robotCrowd.ts). */
  crowd(crowd: RobotCrowd, seen: boolean) {
    if (this.detailed || !this.group.visible || !this.#agents.visible) return;
    for (const robot of this.#robots.values()) crowd.add(robot.handle.object, seen);
  }

  pickables(): THREE.Object3D[] {
    return [this.#agents, this.#shell, this.#props.group, ...this.#objects.pickables()];
  }

  resolve(hit: THREE.Intersection): Pick | null {
    const prop = this.#props.resolve(hit);
    if (prop) return { kind: "prop", id: prop };
    const ticket = this.#objects.pick(hit);
    if (ticket) return { kind: "object", ticketId: ticket };
    const agent = hit.object.userData.agentId as string | undefined;
    if (agent) return { kind: "agent", key: agent };
    const room = hit.object.userData.room as RoomKind | undefined;
    return room ? { kind: "room", room } : null;
  }

  /** World bounds of the building or one of its rooms. */
  bounds(kind: RoomKind | null): Bounds {
    const room = kind ? roomOf(this.template, kind) : undefined;
    const o = this.group.position;
    if (!room) return { minX: o.x - 0.8, maxX: o.x + this.template.size.width * CELL + 0.4, minZ: o.z - 0.8, maxZ: o.z + DEPTH * CELL + 1.4 };
    return {
      minX: o.x + room.origin.x * CELL,
      maxX: o.x + (room.origin.x + room.layout.grid.width) * CELL,
      minZ: o.z + room.origin.z * CELL,
      maxZ: o.z + (room.origin.z + room.layout.grid.depth) * CELL,
    };
  }

  dispose() {
    this.cancelPrepare();
    for (const robot of this.#robots.values()) robot.handle.dispose();
    this.#robots.clear();
    this.#objects.dispose();
    this.#props.dispose();
    for (const geometry of [...this.#merged, ...this.#furnitureMerged, ...this.#pilesMerged, ...this.#silhouetteMerged, ...this.#personalMerged, ...this.#signalsMerged, ...this.#cordsMerged]) geometry.dispose();
    this.group.removeFromParent();
  }
}
