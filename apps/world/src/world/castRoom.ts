/* The casting room's scene (`/cast-preview`): one sample room per shown cast, built from the town style's own pieces
   (floor, slab, glass wall, desks, a sofa corner), with every role of the cast in it. The room plays what the plan says
   (castRoomPlan.ts): a state for the whole cast, a walk, the lead with its workers in tow, or each figure its own way;
   a drone can bring a ticket to a desk. Figures are drawn as in the world: at the interiors' scale, near or, seen from
   town distance, at their far detail through the robot crowd. Nothing here knows a particular cast. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { FigureHandle, FigureHighlight, FigureState } from "@crewhub/world-cast";
import type { EnvironmentHandle, GraphicsQuality, ModelKey, ResolvedStyle } from "@crewhub/world-style";
import type { PreviewCast } from "./castRoomCasts";
import {
  DESKS,
  LEAD_DESK,
  DUSK_PHASE,
  figureArea,
  FIGURE_SCALE,
  FURNITURE,
  MEMBERS,
  memberSpot,
  memberState,
  previewState,
  ROOM,
  ROOM_ACCENT,
  ROOM_CELL as CELL,
  SCENE_START,
  roomOrigin,
  roomPlays,
  type CastMember,
  type PreviewFraming,
  type PreviewLight,
  type PreviewScene,
  type PreviewStateId,
  type RoomPlay,
} from "./castRoomPlan";
import { RobotCrowd } from "./robotCrowd";
import { WORK_FURNITURE, workPlace, type WorkAt } from "./workPlaces";
import { workSurfaceOf } from "./workSurface";

export interface CastRoomView {
  /** The casts shown, one room each (one cast, or all of them side by side). */
  casts: readonly PreviewCast[];
  state: PreviewStateId;
  scene: PreviewScene;
  light: PreviewLight;
  quality: GraphicsQuality;
  reducedMotion: boolean;
  /** Town distance: the camera far out, figures at their far detail, drawn by the robot crowd. */
  far: boolean;
  /** Near only: the camera frames the figures tightly, or the whole room. */
  framing: PreviewFraming;
}

export type CastRoomCamera = "home" | "rotate-left" | "rotate-right" | "zoom-in" | "zoom-out";

/** A figure's id on the page: its room and its member key. */
export const figureId = (room: number, key: string) => `${room}:${key}`;

const FLOOR_RISE = 0.24;
const WALL_HEIGHT = 1.75;
/** A little more from the front than the town's camera, so the wide room fills a wide stage. */
const HOME_DIRECTION = new THREE.Vector3(0.62, 0.9, 1).normalize();
/** The room for a standing figure and the pill over its head, world units. */
const FIGURE_HEADROOM = 1.15;
const CAMERA_DISTANCE = 120;
/** The frustum height of the town-distance view, world units: a figure is then as small as in the town's home view. */
const FAR_SPAN = 40;
const DRONE_SCALE = 1.6;
const DRONE_SECONDS = 3.6;
/** Where the drone comes in: over the low east wall, room cells. */
const DRONE_FROM = { x: ROOM.width + 1.5, z: 5.4 };

interface Figure {
  id: string;
  member: CastMember;
  handle: FigureHandle;
  carried: THREE.Object3D;
  highlight: FigureHighlight;
  /** Its work place at its desk (the members with one), and whether it has been put there before (then it hops). */
  desk: WorkAt | null;
  placed: boolean;
}

/** Where the room's drone sets a ticket down on a desk, cells from the desk's north-west corner. */
const TICKET_SPOT = { x: 0.55, z: 0.6 };
const TICKET_RADIUS = 0.085;

/** A part of the stage, CSS pixels from its top left. */
interface Cell {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Flight {
  ticket: THREE.Object3D;
  drone: THREE.Group;
  shadow: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
}

interface Room {
  cast: PreviewCast;
  play: RoomPlay;
  /** The floor the camera frames of this room, cells. */
  area: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The room's own strip of lawn (near; at town distance the block stands on one lawn). */
  lawn: THREE.Object3D;
  group: THREE.Group;
  figures: Figure[];
  /** The tall back walls and the low rims that stand in for them when the camera looks from behind. */
  backWalls: { north: [THREE.Object3D, THREE.Object3D]; west: [THREE.Object3D, THREE.Object3D] };
  tickets: THREE.Object3D[];
  flight: Flight | null;
  delivered: number;
}

export class CastRoomScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 1, CAMERA_DISTANCE * 3);
  readonly controls: OrbitControls;
  view: CastRoomView;
  #host: HTMLElement;
  #labels: HTMLElement;
  #style: ResolvedStyle;
  #environment: EnvironmentHandle;
  #content = new THREE.Group();
  #rooms: Room[] = [];
  #figures = new Map<string, Figure>();
  #crowd = new RobotCrowd();
  #ring: THREE.Object3D;
  #selected: string | null = null;
  #hovered: string | null = null;
  #onSelect: (id: string | null) => void;
  #bounds = new THREE.Box3();
  #lawns = new THREE.Group();
  #framed = "";
  #deskTop = 0.5;
  #time = SCENE_START;
  #last = 0;
  #raf = 0;
  #observer: ResizeObserver;
  #anchors: { el: HTMLElement; figure: Figure | null; room: Room | null }[] = [];
  #raycaster = new THREE.Raycaster();
  #pointer = new THREE.Vector2();
  #down: { x: number; y: number } | null = null;
  #v = new THREE.Vector3();

  constructor(host: HTMLElement, labels: HTMLElement, style: ResolvedStyle, view: CastRoomView, onSelect: (id: string | null) => void) {
    this.#host = host;
    this.#labels = labels;
    this.#style = style;
    this.view = view;
    this.#onSelect = onSelect;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0, 0);
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = this.renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    host.prepend(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = false;
    this.controls.minZoom = 0.3;
    this.controls.maxZoom = 12;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.35;
    this.#style.setTheme(view.light === "lamplight" ? "lamplight" : "day");
    this.#environment = style.environment(this.scene, this.renderer, view.light === "lamplight" ? "lamplight" : "day");
    this.#ring = style.model("selection-ring");
    this.#ring.visible = false;
    this.scene.add(this.#content, this.#ring, this.#crowd.group);
    this.#applyQuality();
    this.#applyLight();
    this.#build();
    this.camera.position.copy(HOME_DIRECTION).multiplyScalar(CAMERA_DISTANCE);
    this.#frame(true);
    this.#observer = new ResizeObserver(() => this.#frame(false));
    this.#observer.observe(host);
    canvas.addEventListener("pointerdown", this.#pointerDown);
    canvas.addEventListener("pointerup", this.#pointerUp);
    canvas.addEventListener("pointermove", this.#pointerMove);
    canvas.addEventListener("pointerleave", this.#pointerLeave);
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#tick);
  }

  setView(next: CastRoomView) {
    const previous = this.view;
    this.view = next;
    if (previous.light !== next.light) this.#applyLight();
    if (previous.quality !== next.quality) this.#applyQuality();
    const recast = previous.casts.length !== next.casts.length || previous.casts.some((cast, i) => cast !== next.casts[i]);
    // Town distance shows a block of rooms per cast, so it rebuilds too.
    const rebuilt = recast || previous.far !== next.far;
    if (rebuilt) this.#build();
    else if (previous.state !== next.state || previous.scene !== next.scene) {
      const { plays } = roomPlays(next.casts.length, next.state, next.scene, next.far);
      this.#rooms.forEach((room, i) => (room.play = plays[i]!));
    }
    if (previous.scene !== next.scene) this.#time = SCENE_START;
    // What the figures use of the floor changed (a line-up, a loop), or the framing did: the camera frames it again.
    if (this.#layout() || rebuilt) this.#frame(true);
  }

  /** The page's label elements changed: `[data-figure]` pills follow their figure, `[data-room]` titles their room. */
  refreshLabels() {
    this.#anchors = [...this.#labels.querySelectorAll<HTMLElement>("[data-figure], [data-room]")].map((el) => ({
      el,
      figure: this.#figures.get(el.dataset.figure ?? "") ?? null,
      room: el.dataset.room !== undefined ? (this.#rooms[Number(el.dataset.room)] ?? null) : null,
    }));
  }

  select(id: string | null) {
    this.#selected = id;
    this.#highlight();
  }

  hover(id: string | null) {
    this.#hovered = id;
    this.#highlight();
  }

  #highlight() {
    for (const figure of this.#figures.values()) {
      const next: FigureHighlight = figure.id === this.#selected ? "selected" : figure.id === this.#hovered ? "hover" : "none";
      if (next !== figure.highlight) figure.handle.setHighlight((figure.highlight = next));
    }
  }

  moveCamera(action: CastRoomCamera) {
    if (action === "home") {
      this.camera.zoom = 1;
      this.camera.position.copy(HOME_DIRECTION).multiplyScalar(CAMERA_DISTANCE).add(this.controls.target);
      this.#frame(true);
      return;
    }
    if (action === "zoom-in" || action === "zoom-out") {
      this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * (action === "zoom-in" ? 1.25 : 0.8), this.controls.minZoom, this.controls.maxZoom);
      this.camera.updateProjectionMatrix();
      return;
    }
    const offset = this.#v.copy(this.camera.position).sub(this.controls.target);
    offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, action === "rotate-left" ? -Math.PI / 4 : Math.PI / 4);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
  }

  /** A ticket arrives by drone at the next desk of every room. */
  sendDrone() {
    const desks = Object.values(DESKS);
    for (const room of this.#rooms) {
      if (room.flight) continue;
      if (room.delivered >= desks.length) {
        for (const ticket of room.tickets) ticket.removeFromParent();
        room.tickets = [];
        room.delivered = 0;
      }
      const desk = desks[room.delivered++]!;
      const ticket = this.#style.model("ticket.task");
      const drone = new THREE.Group();
      drone.add(this.#style.model("drone"));
      drone.scale.setScalar(DRONE_SCALE);
      const shadow = this.#style.model("town.contact-shadow", { size: { width: 0.05, height: 0, depth: 0.05 } });
      room.group.add(ticket, drone, shadow);
      room.tickets.push(ticket);
      room.flight = {
        ticket,
        drone,
        shadow,
        from: new THREE.Vector3(DRONE_FROM.x * CELL, 0.03, DRONE_FROM.z * CELL),
        to: new THREE.Vector3((desk.x + TICKET_SPOT.x) * CELL, this.#deskTop + 0.01, (desk.z + TICKET_SPOT.z) * CELL),
        t: 0,
      };
    }
  }

  #applyLight() {
    const theme = this.view.light === "lamplight" ? "lamplight" : "day";
    this.#style.setTheme(theme);
    this.#environment.setTheme(theme);
    this.#environment.setDayPhase(this.view.light === "dusk" ? DUSK_PHASE : null);
    // The air behind the room follows the light, as the town's does (world.css mixes it into the theme's air).
    const { color, tint } = this.#environment.air;
    this.#host.style.setProperty("--drift-air", `rgb(${Math.round(color.r * 255)} ${Math.round(color.g * 255)} ${Math.round(color.b * 255)})`);
    this.#host.style.setProperty("--drift-air-tint", `${(tint * 100).toFixed(1)}%`);
  }

  #applyQuality() {
    const pretty = this.view.quality === "pretty";
    this.renderer.shadowMap.enabled = pretty;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pretty ? 2 : 1));
    this.#environment.setQuality(this.view.quality);
    if (this.#rooms.length) this.#frame(false);
  }

  /** Builds a room per shown cast; the rooms are the same, only the figures differ. */
  #build() {
    for (const figure of this.#figures.values()) figure.handle.dispose();
    this.#figures.clear();
    this.#content.clear();
    this.#rooms = [];
    const { casts, far } = this.view;
    const { plays } = roomPlays(casts.length, this.view.state, this.view.scene, far);
    plays.forEach((play, index) => {
      const room = this.#room(casts[play.cast]!, play, index);
      this.#content.add(room.group);
      this.#rooms.push(room);
    });
    this.#content.add(this.#lawns);
    this.#framed = "";
    this.#layout();
    if (this.#selected && !this.#figures.has(this.#selected)) this.#onSelect((this.#selected = null));
    this.#highlight();
    this.refreshLabels();
  }

  /**
   * The stage's cells in CSS pixels when the rooms are side by side and near: a grid of equal cells, two to a row,
   * one room drawn in each with the same camera. Null when the stage is one picture (one room, or town distance).
   */
  #cells(): Cell[] | null {
    const count = this.#rooms.length;
    if (this.view.far || count < 2) return null;
    const gap = 8,
      top = 26;
    const rows = Math.ceil(count / 2);
    const width = (this.#host.clientWidth - gap) / 2,
      height = (this.#host.clientHeight - gap * (rows - 1)) / rows;
    // The top of each cell is kept for the cast's name.
    return this.#rooms.map((_, i) => ({ x: (i % 2) * (width + gap), y: Math.floor(i / 2) * (height + gap) + top, width, height: height - top }));
  }

  /**
   * Places the rooms and fits the bounds the camera frames; true when they changed. At town distance the rooms stand
   * in a block on one lawn, as buildings would. Near, every room stands on the same spot, centred on what the camera
   * frames of it: side by side each is drawn alone into its own cell of the stage (`#cells`).
   */
  #layout(): boolean {
    const { far, framing, casts } = this.view;
    const { plays, columns } = roomPlays(casts.length, this.view.state, this.view.scene, far);
    const whole = far || framing === "room";
    const areas = plays.map((play) => (whole ? { minX: -0.5, maxX: ROOM.width + 0.5, minZ: -0.5, maxZ: ROOM.depth + 0.5 } : figureArea(play)));
    const key = JSON.stringify([far, framing, columns, areas]);
    if (key === this.#framed) return false;
    this.#framed = key;
    const low = whole ? -FLOOR_RISE : 0,
      high = whole ? WALL_HEIGHT : FIGURE_HEADROOM;
    this.#bounds.makeEmpty();
    this.#lawns.clear();
    this.#rooms.forEach((room, index) => {
      const area = (room.area = areas[index]!);
      room.lawn.visible = !far;
      if (far) {
        const origin = roomOrigin(index, columns);
        room.group.position.set(origin.x * CELL, 0, origin.z * CELL);
      } else room.group.position.set((-(area.minX + area.maxX) / 2) * CELL, 0, (-(area.minZ + area.maxZ) / 2) * CELL);
      const at = room.group.position;
      this.#bounds.expandByPoint(this.#v.set(at.x + area.minX * CELL, low, at.z + area.minZ * CELL));
      this.#bounds.expandByPoint(this.#v.set(at.x + area.maxX * CELL, high, at.z + area.maxZ * CELL));
    });
    const centre = this.#bounds.getCenter(new THREE.Vector3()).setY(0);
    const size = this.#bounds.getSize(new THREE.Vector3());
    if (far) {
      const lawn = this.#style.model("plot", { size: { width: size.x + 30, height: 0.16, depth: size.z + 30 } });
      lawn.position.set(centre.x, -FLOOR_RISE - 0.09, centre.z);
      this.#lawns.add(lawn);
    }
    this.#content.position.set(0, 0, 0).sub(centre);
    this.#bounds.translate(this.#content.position);
    this.#environment.setShadowReach(Math.hypot(size.x, size.z) / 2 + 3);
    return true;
  }

  #room(cast: PreviewCast, play: RoomPlay, index: number): Room {
    const style = this.#style;
    const group = new THREE.Group();
    const width = ROOM.width * CELL,
      depth = ROOM.depth * CELL;
    const add = (object: THREE.Object3D, x: number, z: number, y = 0, rotation = 0) => {
      object.position.set(x * CELL, y, z * CELL);
      object.rotation.y = rotation;
      group.add(object);
      return object;
    };
    const lawn = add(style.model("plot", { size: { width: width + 2.4, height: 0.16, depth: depth + 2.4 } }), ROOM.width / 2, ROOM.depth / 2, -FLOOR_RISE - 0.09);
    add(style.model("floor", { size: { width, height: 0, depth } }), ROOM.width / 2, ROOM.depth / 2, 0.02);
    add(style.model("building.floor-shade", { size: { width, height: 0, depth } }), ROOM.width / 2, ROOM.depth / 2, 0.026);
    add(style.model("building.slab", { size: { width, height: FLOOR_RISE, depth }, accent: ROOM_ACCENT }), ROOM.width / 2, ROOM.depth / 2);
    // The glass wall to the north (the room's window) and the chalk wall to the west are tall; the south and east are
    // low rims to look in over. A tall wall the camera would look through from behind gives way to a low rim.
    const rim = (length: number) => style.model("wall.low", { size: { width: length + 0.12, height: 0.22, depth: 0.12 } });
    const backWalls: Room["backWalls"] = {
      north: [add(style.model("wall.glass", { size: { width: width + 0.16, height: WALL_HEIGHT, depth: 0.16 } }), ROOM.width / 2, 0), add(rim(width), ROOM.width / 2, 0)],
      west: [
        add(style.model("wall", { size: { width: depth + 0.16, height: WALL_HEIGHT, depth: 0.16 } }), 0, ROOM.depth / 2, 0, Math.PI / 2),
        add(rim(depth), 0, ROOM.depth / 2, 0, Math.PI / 2),
      ],
    };
    add(rim(width), ROOM.width / 2, ROOM.depth);
    add(rim(depth), ROOM.width, ROOM.depth / 2, 0, Math.PI / 2);
    for (const piece of FURNITURE) {
      const model = style.model(piece.key as ModelKey, piece.seed === undefined ? {} : { seed: piece.seed });
      if (piece.key === "furniture.workdesk") this.#deskTop = new THREE.Box3().setFromObject(model).max.y + 0.02;
      if (piece.scale) model.scale.setScalar(piece.scale);
      add(model, piece.x, piece.z, piece.y ?? 0.02, piece.rotation ?? 0);
    }
    const figures = MEMBERS.map((member): Figure => {
      const handle = cast.figure({ key: member.key, role: member.role, accent: member.accent });
      handle.object.scale.setScalar(FIGURE_SCALE);
      handle.setDetail(this.view.far ? "far" : "near");
      // What a figure carries rides at its carry anchor: the postman's letter, a ticket for anyone else.
      const carried = style.model(member.role === "postman" ? "letter" : "ticket.task");
      carried.position.set(...handle.anchors.carry);
      carried.rotation.x = -0.35;
      carried.visible = false;
      // It rides with the figure itself, up on a perch too.
      handle.body.add(carried);
      group.add(handle.object);
      const figure: Figure = { id: figureId(index, member.key), member, handle, carried, highlight: "none", desk: this.#deskAt(member), placed: false };
      this.#figures.set(figure.id, figure);
      return figure;
    });
    return { cast, play, lawn, area: { minX: 0, maxX: ROOM.width, minZ: 0, maxZ: ROOM.depth }, group, figures, backWalls, tickets: [], flight: null, delivered: 0 };
  }

  /** A member's work place at its desk, as in a building: the seat north of it, clear of where the drone's ticket lands. */
  #deskAt(member: CastMember): WorkAt | null {
    const lead = member.role === "lead";
    const desk = lead ? LEAD_DESK : DESKS[member.key];
    if (!desk) return null;
    const furniture = WORK_FURNITURE[lead ? "lead-desk" : "workdesk"]!;
    const [width, depth] = lead ? [3, 2] : [2, 1];
    const ticket = { x: (desk.x + TICKET_SPOT.x) * CELL, z: (desk.z + TICKET_SPOT.z) * CELL, radius: TICKET_RADIUS };
    const at = { x: (desk.x + width / 2) * CELL, z: (desk.z + depth / 2) * CELL, rotation: Math.PI };
    return workPlace(furniture.pose, workSurfaceOf(this.#style, furniture.key), at, { x: member.home.x * CELL, z: member.home.z * CELL }, FIGURE_SCALE, lead ? [] : [ticket]);
  }

  /**
   * Fits the camera to the rooms from its current direction (the town-distance view: far out instead). `recentre`
   * also aims it at the rooms' centre again.
   */
  #frame(recentre: boolean) {
    const width = this.#host.clientWidth,
      height = this.#host.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    const camera = this.camera;
    if (recentre) {
      const offset = this.#v.copy(camera.position).sub(this.controls.target).setLength(CAMERA_DISTANCE);
      this.controls.target.set(0, (this.#bounds.min.y + this.#bounds.max.y) / 2, 0);
      camera.position.copy(this.controls.target).add(offset);
      camera.zoom = 1;
    }
    camera.lookAt(this.controls.target);
    camera.updateMatrixWorld();
    // The rooms' bounds in view space, measured from the point the camera looks at.
    const box = this.#bounds;
    const aim = new THREE.Vector3().copy(this.controls.target).applyMatrix4(camera.matrixWorldInverse);
    let halfW = 0,
      halfH = 0;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(camera.matrixWorldInverse);
      halfW = Math.max(halfW, Math.abs(p.x - aim.x));
      halfH = Math.max(halfH, Math.abs(p.y - aim.y));
    }
    halfW += 0.2;
    halfH += 0.25;
    if (this.view.far) halfH = Math.max(halfH, FAR_SPAN / 2);
    const cell = this.#cells()?.[0];
    const aspect = cell ? cell.width / cell.height : width / height;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    camera.updateProjectionMatrix();
  }

  #place(room: Room, figure: Figure, seconds: number) {
    const { member, handle } = figure;
    const { scene } = room.play;
    const { spot, walking } = memberSpot(scene, room.play.state, member, this.#time);
    handle.object.position.set(spot.x * CELL, 0.02, spot.z * CELL);
    // A walk on the spot (the chosen state "walking" at their places) shows in profile.
    const state: FigureState = memberState(scene, previewState(room.play.state), member, this.#time);
    handle.object.rotation.y = !walking && state.activity === "walking" ? Math.PI / 2 : spot.heading;
    handle.setState(state);
    // At its desk it works at the top as its cast does (a step, the top itself); an echo and the far crowd do not.
    const at = spot === member.home && !state.proxy && !this.view.far ? figure.desk : null;
    if (at) handle.object.rotation.y = at.heading;
    handle.setPerch(at?.place ?? null, this.view.reducedMotion || !figure.placed);
    figure.placed = true;
    figure.carried.visible = state.carrying;
    if (!this.view.reducedMotion) handle.update(seconds);
  }

  #fly(room: Room, seconds: number) {
    const flight = room.flight;
    if (!flight) return;
    const reduced = this.view.reducedMotion;
    flight.t = Math.min(1, flight.t + seconds / (reduced ? 1.4 : DRONE_SECONDS));
    const { t, from, to, ticket, drone, shadow } = flight;
    const body = drone.children[0]!;
    if (reduced) {
      // A short fade, as in the world: the drone shows at the door, the ticket is set down on the desk halfway.
      ticket.position.copy(t < 0.5 ? from : to);
      drone.position.copy(ticket.position).setY(ticket.position.y + 0.03);
      this.#style.materialise(body, t < 0.5 ? Math.min(1, t * 6) : Math.min(1, (1 - t) * 6));
      shadow.visible = false;
    } else {
      // Hook (the first 15 %), an arc over the wall, set down (the last 15 %): the world's ticket flight.
      const u = THREE.MathUtils.clamp((t - 0.15) / 0.7, 0, 1);
      const eased = u * u * (3 - 2 * u);
      ticket.position.lerpVectors(from, to, eased);
      ticket.position.y += Math.sin(Math.PI * eased) * (1.1 + from.distanceTo(to) * 0.12);
      drone.position.copy(ticket.position).setY(ticket.position.y + 0.03 + (t < 0.15 ? (1 - t / 0.15) * 0.8 : 0) + (t > 0.85 ? ((t - 0.85) / 0.15) * 0.8 : 0));
      const fade = t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;
      this.#style.materialise(body, fade);
      shadow.visible = fade > 0.02;
      shadow.position.set(drone.position.x, 0.024, drone.position.z);
      shadow.scale.setScalar((0.9 * Math.max(0.001, fade)) / (1 + Math.max(0, drone.position.y) * 0.45));
      (body.userData.animate as ((s: number) => void) | undefined)?.(seconds);
    }
    if (t >= 1) {
      ticket.position.copy(to);
      drone.removeFromParent();
      shadow.removeFromParent();
      room.flight = null;
    }
  }

  #tick = (now: number) => {
    this.#raf = requestAnimationFrame(this.#tick);
    const seconds = Math.min(0.1, (now - this.#last) / 1000);
    this.#last = now;
    if (!this.view.reducedMotion) this.#time += seconds;
    const camera = this.camera;
    this.controls.update();
    // A tall back wall stands only while the camera looks at its inner face.
    const north = camera.position.z > this.controls.target.z,
      west = camera.position.x > this.controls.target.x;
    for (const room of this.#rooms) {
      room.backWalls.north[0].visible = north;
      room.backWalls.north[1].visible = !north;
      room.backWalls.west[0].visible = west;
      room.backWalls.west[1].visible = !west;
      for (const figure of room.figures) this.#place(room, figure, seconds);
      this.#fly(room, seconds);
    }
    const selected = this.#selected ? this.#figures.get(this.#selected) : undefined;
    const ringed = !!selected && !this.view.far;
    this.#ring.visible = ringed;
    if (selected) {
      selected.handle.body.getWorldPosition(this.#ring.position);
      this.#ring.position.y += 0.012;
      this.#ring.scale.setScalar((selected.handle.anchors.ground * selected.handle.body.scale.x) / 0.3);
    }
    // Seen from town distance the figures draw as the town draws them: batched by the robot crowd.
    this.scene.updateMatrixWorld();
    this.#crowd.begin();
    if (this.view.far) for (const figure of this.#figures.values()) this.#crowd.add(figure.handle.object, true);
    this.#crowd.end();
    const cells = this.#cells();
    if (!cells) this.renderer.render(this.scene, camera);
    else {
      // Side by side: each room alone, into its own cell, with the same camera.
      const height = this.#host.clientHeight;
      this.renderer.setScissorTest(true);
      cells.forEach((cell, index) => {
        this.#rooms.forEach((room, i) => (room.group.visible = i === index));
        this.#ring.visible = ringed && this.#rooms[index]!.figures.includes(selected!);
        this.renderer.setViewport(cell.x, height - cell.y - cell.height, cell.width, cell.height);
        this.renderer.setScissor(cell.x, height - cell.y - cell.height, cell.width, cell.height);
        this.renderer.render(this.scene, camera);
      });
      for (const room of this.#rooms) room.group.visible = true;
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.#host.clientWidth, height);
    }
    this.#placeLabels(cells);
    if (!this.#host.dataset.ready) this.#host.dataset.ready = "true";
  };

  #placeLabels(cells: Cell[] | null) {
    const whole = { x: 0, y: 0, width: this.#host.clientWidth, height: this.#host.clientHeight };
    for (const anchor of this.#anchors) {
      const p = this.#v;
      let x: number, y: number;
      if (anchor.figure) {
        const { handle } = anchor.figure;
        const cell = cells?.[this.#rooms.findIndex((room) => room.figures.includes(anchor.figure!))] ?? whole;
        handle.body.localToWorld(p.set(handle.anchors.label[0], handle.anchors.label[1], handle.anchors.label[2])).project(this.camera);
        [x, y] = [cell.x + ((p.x + 1) / 2) * cell.width, cell.y + ((1 - p.y) / 2) * cell.height];
      } else if (anchor.room) {
        const cell = cells?.[this.#rooms.indexOf(anchor.room)];
        if (cell) [x, y] = [cell.x + cell.width / 2, cell.y - 24];
        else {
          // A block of rooms: the title sits at the front of its room.
          const { area } = anchor.room;
          anchor.room.group.localToWorld(p.set(((area.minX + area.maxX) / 2 + 0.6) * CELL, 0, (area.maxZ + 0.6) * CELL)).project(this.camera);
          [x, y] = [((p.x + 1) / 2) * whole.width, ((1 - p.y) / 2) * whole.height];
        }
      } else continue;
      anchor.el.style.transform = `translate(-50%, ${anchor.figure ? "-100%" : "0"}) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  #pick(event: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    const cells = this.#cells();
    const index = cells ? cells.findIndex((c) => x >= c.x && x <= c.x + c.width && y >= c.y && y <= c.y + c.height) : -1;
    if (cells && index < 0) return null;
    const cell = cells ? cells[index]! : { x: 0, y: 0, width: rect.width, height: rect.height };
    this.#pointer.set(((x - cell.x) / cell.width) * 2 - 1, -((y - cell.y) / cell.height) * 2 + 1);
    this.#raycaster.setFromCamera(this.#pointer, this.camera);
    let best: string | null = null,
      distance = Infinity;
    for (const figure of cells ? this.#rooms[index]!.figures : this.#figures.values()) {
      const hit = this.#raycaster.intersectObject(figure.handle.object, true)[0];
      if (hit && hit.distance < distance) [best, distance] = [figure.id, hit.distance];
    }
    return best;
  }

  #pointerDown = (event: PointerEvent) => {
    this.#down = { x: event.clientX, y: event.clientY };
  };
  #pointerUp = (event: PointerEvent) => {
    const down = this.#down;
    this.#down = null;
    // A click, not the end of a drag that turned the camera.
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5 || this.view.far) return;
    this.#onSelect(this.#pick(event));
  };
  #pointerMove = (event: PointerEvent) => {
    if (this.#down || this.view.far || event.pointerType !== "mouse") return;
    const id = this.#pick(event);
    if (id !== this.#hovered) this.hover(id);
    this.renderer.domElement.style.cursor = id ? "pointer" : "";
  };
  #pointerLeave = () => this.hover(null);

  dispose() {
    cancelAnimationFrame(this.#raf);
    this.#observer.disconnect();
    for (const figure of this.#figures.values()) figure.handle.dispose();
    this.#figures.clear();
    this.#crowd.dispose();
    this.controls.dispose();
    this.#environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    delete this.#host.dataset.ready;
  }
}
