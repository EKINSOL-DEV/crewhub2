/* One building on its plot, drawn from the WorldModel with the building's resolved style. Two levels of detail: every
   building shows its shell (room floors, low walls with door gaps, flag, emblem), its agents at their desks and the
   height of each status room's pile; the entered building adds the furniture, every work object, the signals (desk
   lamps, quiet clocks, the attention beacon, trophy, banner, mailbox letters) and the ticket drones. Layers rebuild
   only when their signature changes. */
import * as THREE from "three";
import type { AgentPlacement, Building, RoomKind } from "@crewhub/world-model";
import type { EmblemName, ModelKey, PaletteName, ResolvedStyle, RobotHandle, RobotPosture } from "@crewhub/world-style";
import { BUILDING_CELL as CELL, buildingTemplate, DEPTH, MAX_WIDTH, roomOf, STATUS_ROOMS, wallRuns, type BuildingTemplate } from "./buildingTemplate";
import { assignDesks, placeObjects, roomCentre, type DeskSlot, type ObjectLayout, type Surface } from "./interiorLayout";
import { mergeStatic } from "./mergeStatic";
import { ObjectLayer } from "./objectLayer";
import type { Bounds } from "./townLayout";
import type { Walker } from "./walks";

/** Robots and desks are Greenhouse-sized; interiors show them at this scale. */
const ROBOT_SCALE = 0.62;
const TALL_WALL = 1.1;
const LOW_WALL = 0.32;
const WALL = 0.1;
const TRUCK_S = 2.4;

export interface BuildingContext {
  style: ResolvedStyle;
  /** Source time now (ms). */
  now: () => number;
  reducedMotion: () => boolean;
  /** The walk runtime's interpolated position of an agent, when it has one (walks.ts). */
  walker: (key: string) => Walker | undefined;
}

export type Pick = { kind: "agent"; key: string } | { kind: "object"; ticketId: string } | { kind: "room"; room: RoomKind };

interface Robot {
  handle: RobotHandle;
  signature: string;
  /** A real avatar follows its walker; a proxy stays still at its home place. */
  real: boolean;
  /** The model's posture, shown whenever the robot is not walking. */
  posture: RobotPosture;
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
  #shell = new THREE.Group();
  /** The static parts of the shell (walls, flag, emblem, signs), batched per material. */
  #shellStatic = new THREE.Group();
  #merged: THREE.BufferGeometry[] = [];
  #furnitureMerged: THREE.BufferGeometry[] = [];
  #furniture: THREE.Group | null = null;
  #piles = new THREE.Group();
  #signals = new THREE.Group();
  #agents = new THREE.Group();
  #robots = new Map<string, Robot>();
  #objects: ObjectLayer;
  #truck: THREE.Object3D | null = null;
  #truckHome = new THREE.Vector3();
  /** Where flights to the truck set their package down (building-local). */
  readonly #truckTarget = new THREE.Vector3();
  #truckDrive: { t: number } | null = null;
  #truckPending = false;
  #focus: THREE.Object3D | null = null;
  #signatures = { shell: "", furniture: "", piles: "", signals: "" };
  #archivedCount: number;

  constructor(building: Building, centre: { x: number; z: number }, plotSize: number, ctx: BuildingContext) {
    this.ctx = ctx;
    this.building = building;
    this.template = buildingTemplate(building);
    this.#archivedCount = building.archivedCount;
    // The north-west corner never moves: role rooms grow east inside the reserved plot.
    this.group.position.set(centre.x - (MAX_WIDTH * CELL) / 2, 0.17, centre.z - plotSize / 2 + 0.6);
    this.#objects = new ObjectLayer(building.slug, {
      style: ctx.style,
      now: ctx.now,
      reducedMotion: ctx.reducedMotion,
      truck: this.#truckTarget,
      surface: (s) => surfacesOf(ctx.style)[s],
    });
    this.group.add(this.#shell, this.#shellStatic, this.#piles, this.#agents, this.#signals, this.#objects.group);
  }

  /** Building cells to building-local world units. */
  local(x: number, z: number, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(x * CELL, y, z * CELL);
  }
  world(x: number, z: number, y = 0): THREE.Vector3 {
    return this.local(x, z, y).add(this.group.position);
  }

  update(building: Building, detailed: boolean) {
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
    if (this.detailed && shape !== this.#signatures.furniture) {
      this.#signatures.furniture = shape;
      this.#buildFurniture();
    }
    if (this.#furniture) this.#furniture.visible = this.detailed;
    this.#syncAgents();
    this.#syncPiles();
    this.#piles.visible = !this.detailed;
    this.#signals.visible = this.detailed;
    this.#objects.group.visible = this.detailed;
    if (this.detailed) {
      this.#syncSignals();
      this.#objects.sync(building, this.layout);
      for (const [id, v] of this.#objects.anchors) this.anchors.set(id, v);
    }
    if (building.archivedCount > this.#archivedCount) this.#truckPending = true;
    this.#archivedCount = building.archivedCount;
  }

  /* ── Shell: floors, walls, door step, flag, emblem, room signs ───────────── */

  #buildShell() {
    const { style } = this.ctx;
    this.#shell.clear();
    this.#shellStatic.clear();
    for (const g of this.#merged) g.dispose();
    const b = this.building;
    const accent = (b.color ?? null) as PaletteName | null;
    const variant = b.archived ? "archived" : undefined;
    const opt = (o: object) => (variant ? { ...o, variant } : o);
    for (const room of this.template.rooms) {
      const { width, depth } = room.layout.grid;
      const present = b.rooms.find((r) => r.kind === room.kind)?.present ?? true;
      const floor = style.model("floor", { size: { width: width * CELL, height: 0, depth: depth * CELL }, ...(b.archived || !present ? { variant: "dim" } : {}) });
      floor.position.copy(this.local(room.origin.x + width / 2, room.origin.z + depth / 2, 0.02));
      floor.traverse((o) => (o.userData.room = room.kind));
      this.#shell.add(floor);
      const sign = style.model("room.sign");
      const at = this.#signSpot(room.kind);
      sign.position.copy(this.local(at.x, at.z, 0.02));
      this.#shellStatic.add(sign);
      this.anchors.set(`r:${b.slug}:${room.kind}`, this.world(at.x, at.z, 0.35));
    }
    for (const run of wallRuns(this.template)) {
      const horizontal = run.z1 === run.z2;
      const length = (horizontal ? run.x2 - run.x1 : run.z2 - run.z1) * CELL;
      const key: ModelKey = run.side === "north" ? "wall.glass" : run.side === "west" ? "wall" : "wall.low";
      const height = run.side === "north" || run.side === "west" ? TALL_WALL : LOW_WALL;
      const wall = style.model(key, opt({ size: { width: length + WALL, height, depth: WALL }, accent: run.side === "inner" ? null : accent }));
      wall.position.copy(this.local((run.x1 + run.x2) / 2, (run.z1 + run.z2) / 2));
      if (!horizontal) wall.rotation.y = Math.PI / 2;
      this.#shellStatic.add(wall);
    }
    const entrance = this.template.doors.find((d) => d.b.room === "town");
    if (entrance) {
      const step = style.model("door", { size: { width: 1.2, height: 0.06, depth: 0.5 } });
      step.position.copy(this.local(entrance.b.cell.x + 0.5, DEPTH + 0.4));
      this.#shellStatic.add(step);
      if (b.archived) {
        const planks = style.model("building.planks", { size: { width: 0.8, height: 0.4, depth: 0.05 } });
        planks.position.copy(this.local(entrance.b.cell.x + 0.5, DEPTH));
        this.#shellStatic.add(planks);
      }
    }
    const flag = style.model("building.flag", opt({ accent }));
    flag.position.copy(this.local(-0.6, -0.6));
    this.#shellStatic.add(flag);
    if (b.icon) {
      const emblem = style.model(`emblem.${b.icon as EmblemName}`, { accent });
      emblem.position.copy(this.local(17, DEPTH + 1.3));
      this.#shellStatic.add(emblem);
    }
    // The truck parks in front of Dispatch, nose to the west, ready to drive off the plot.
    if (!b.archived) {
      this.#truck = style.model("truck", { accent });
      this.#truckHome.copy(this.local(3, DEPTH + 1.6));
      this.#truck.position.copy(this.#truckHome);
      this.#truck.rotation.y = Math.PI;
      this.#truck.scale.setScalar(0.85);
      this.#shell.add(this.#truck);
      this.#truckTarget.copy(this.#truckHome).setY(0.55);
    } else this.#truck = null;
    this.anchors.set(`truck:${b.slug}`, this.world(3, DEPTH + 1.6, 1));
    this.#merged = mergeStatic(this.#shellStatic);
    this.#applyFocus();
  }


  #signSpot(kind: RoomKind): { x: number; z: number } {
    const room = roomOf(this.template, kind)!;
    return { x: room.origin.x + 1.1, z: room.origin.z + room.layout.grid.depth - 0.45 };
  }

  #buildFurniture() {
    const { style } = this.ctx;
    this.#furniture?.removeFromParent();
    const g = new THREE.Group();
    for (const room of this.template.rooms)
      for (const prop of room.layout.props) {
        const def = prop.definitionId;
        const size =
          def === "workdesk" ? [2, 1] : def === "lead-desk" ? [3, 2] : def === "rack" ? [2, 1] : def === "planning-table" ? [4, 1] : def === "review-pile" ? [3, 2] : def === "pallet" ? [2, 2] : def === "meeting-table" ? [4, 2] : def === "bench" ? [3, 1] : [1, 1];
        const model = style.model(`furniture.${def}`, { seed: prop.id.length });
        model.position.copy(this.local(room.origin.x + prop.cell.x + size[0]! / 2, room.origin.z + prop.cell.z + size[1]! / 2, 0.02));
        // Desks face their seat to the north, so the agent looks over the desk towards the camera.
        if (def === "workdesk" || def === "lead-desk") model.rotation.y = Math.PI;
        if (def === "plant") model.scale.setScalar(ROBOT_SCALE);
        if (def === "bench" || def === "coffee-machine") model.scale.setScalar(0.7);
        g.add(model);
      }
    this.#furniture = g;
    this.group.add(g);
    for (const geometry of this.#furnitureMerged) geometry.dispose();
    this.#furnitureMerged = mergeStatic(g);
  }

  /* ── Agents ─────────────────────────────────────────────────────────────── */

  #syncAgents() {
    const { style } = this.ctx;
    const b = this.building;
    const seen = new Set<string>();
    const loose = new Map<RoomKind, number>();
    for (const agent of b.archived ? [] : b.agents) {
      seen.add(agent.key);
      const role = agent.role;
      const accent = agent.key === b.lead.id ? ((b.color ?? null) as PaletteName | null) : null;
      const signature = `${role}|${accent}`;
      let robot = this.#robots.get(agent.key);
      if (!robot || robot.signature !== signature) {
        robot?.handle.dispose();
        robot = { handle: style.robot({ key: agent.key, accent, role }), signature, real: false, posture: "relaxed", departing: false };
        robot.handle.object.scale.setScalar(ROBOT_SCALE);
        this.#robots.set(agent.key, robot);
        this.#agents.add(robot.handle.object);
      }
      robot.real = agent.presence === "real";
      // Seen from the town, a robot is a few pixels tall: the style may drop its small parts and shadows.
      robot.handle.setDetail(this.detailed ? "near" : "far");
      robot.departing = false;
      robot.posture = agent.presence === "proxy" ? "relaxed" : (agent.posture as RobotPosture);
      const seat = this.desks.get(agent.key)?.seat ?? this.#looseSpot(agent, loose);
      robot.handle.object.position.copy(this.local(seat.x + 0.5, seat.z + 0.5, 0.02));
      robot.handle.object.rotation.y = 0;
      robot.handle.setPosture(robot.posture);
      robot.handle.setProxy(agent.presence === "proxy");
      robot.handle.setAlert(agent.alerts.length > 0);
      const anchor = this.anchors.get(`a:${b.slug}:${agent.key}`);
      if (anchor) anchor.copy(this.world(seat.x + 0.5, seat.z + 0.5, 1.02));
      else this.anchors.set(`a:${b.slug}:${agent.key}`, this.world(seat.x + 0.5, seat.z + 0.5, 1.02));
      this.#follow(agent.key, robot);
    }
    for (const [key, robot] of this.#robots)
      if (!seen.has(key)) {
        // A worker that left the snapshot keeps its robot until it is out of the door.
        const walker = this.ctx.walker(key);
        if (robot.real && walker?.leaving && walker.building === b.slug) {
          robot.departing = true;
          robot.handle.setAlert(false);
          this.anchors.delete(`a:${b.slug}:${key}`);
          continue;
        }
        this.#dropRobot(key, robot);
      }
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
    robot.handle.object.position.set(walker.x - o.x, walker.y - o.y + 0.02, walker.z - o.z);
    robot.handle.object.rotation.y = walker.heading;
    robot.handle.setPosture(walker.walking ? "walking" : walker.seated ? robot.posture : "relaxed");
    this.anchors.get(`a:${this.building.slug}:${key}`)?.set(walker.x, walker.y + 1.04, walker.z);
    return walker.walking;
  }

  /** An agent past its room's desks stands near the room's middle. */
  #looseSpot(agent: AgentPlacement, loose: Map<RoomKind, number>) {
    const room = agent.room ? roomOf(this.template, agent.room) : undefined;
    const n = loose.get(agent.room ?? "lobby") ?? 0;
    loose.set(agent.room ?? "lobby", n + 1);
    if (!room) return { x: 10 + n, z: 17 };
    return { x: room.origin.x + 0.2 + (n % Math.max(1, room.layout.grid.width - 1)), z: room.origin.z + room.layout.grid.depth - 1.2 };
  }

  /* ── Pile heights (town view) ───────────────────────────────────────────── */

  #syncPiles() {
    const counts = STATUS_ROOMS.map((kind) => this.building.objects.filter((o) => o.room === kind).length);
    const signature = counts.join();
    if (signature === this.#signatures.piles) return;
    this.#signatures.piles = signature;
    this.#piles.clear();
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
    const leadDesk = this.desks.get(b.lead.id);
    if (published && leadDesk) {
      const trophy = style.model("trophy");
      trophy.position.copy(this.local(leadDesk.desk.x + 0.2, leadDesk.desk.z - 0.3, surfacesOf(style)["lead-desk"]));
      this.#signals.add(trophy);
    }
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
  }

  /* ── Focus, motion, picking ─────────────────────────────────────────────── */

  #focusRoom: RoomKind | null = null;
  setFocus(kind: RoomKind | null) {
    if (kind === this.#focusRoom && this.#focus) return;
    this.#focusRoom = kind;
    this.#applyFocus();
  }
  #applyFocus() {
    this.#focus?.removeFromParent();
    this.#focus = null;
    const room = this.#focusRoom ? roomOf(this.template, this.#focusRoom) : undefined;
    if (!room) return;
    const { width, depth } = room.layout.grid;
    this.#focus = this.ctx.style.model("focus-ring", { size: { width: width * CELL - 0.1, height: 0, depth: depth * CELL - 0.1 } });
    this.#focus.position.copy(this.local(room.origin.x + width / 2, room.origin.z + depth / 2, 0.03));
    this.group.add(this.#focus);
  }

  /** True while something here moves. */
  get animating(): boolean {
    const idle = !this.ctx.reducedMotion() && this.#robots.size > 0;
    return (this.detailed && (this.#objects.animating || idle)) || this.#truckDrive !== null || this.#truckPending;
  }

  tick(seconds: number) {
    const reduced = this.ctx.reducedMotion();
    for (const [key, robot] of this.#robots) {
      if (robot.departing && !this.ctx.walker(key)) {
        this.#dropRobot(key, robot);
        continue;
      }
      const walking = this.#follow(key, robot);
      // Robots in a building seen from the town only animate while they walk.
      if (!reduced && (this.detailed || walking)) robot.handle.update(seconds);
    }
    if (this.detailed) {
      this.#objects.update(seconds);
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
    this.#truckDrive.t += seconds / TRUCK_S;
    const t = this.#truckDrive.t;
    if (reduced) {
      // Instant: gone for a moment, then back.
      truck.visible = t > 0.6;
    } else if (t < 0.55) {
      const u = t / 0.55;
      truck.position.copy(this.#truckHome).setX(this.#truckHome.x - u * u * 4.5);
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

  pickables(): THREE.Object3D[] {
    return [this.#agents, this.#shell, ...this.#objects.pickables()];
  }

  resolve(hit: THREE.Intersection): Pick | null {
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
    for (const robot of this.#robots.values()) robot.handle.dispose();
    this.#robots.clear();
    this.#objects.dispose();
    for (const geometry of [...this.#merged, ...this.#furnitureMerged]) geometry.dispose();
    this.group.removeFromParent();
  }
}
