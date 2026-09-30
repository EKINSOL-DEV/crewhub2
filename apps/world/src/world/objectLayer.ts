/* Work objects of the entered building, drawn instanced: one InstancedMesh per mesh of each style template (a ticket
   look, a tag, a strap, …), so a pile of fifty tickets costs a handful of draw calls. The ticket drone carries flying
   objects along an arc in source time; a re-stack eases over a short tween; a person's move to done hops once with a
   sparkle. Under reduced motion flights are a short fade and nothing hops. The frame path allocates nothing. */
import * as THREE from "three";
import type { ModelKey, ModelOptions, PaletteName, ResolvedStyle } from "@crewhub/world-style";
import type { Building, WorkObject } from "@crewhub/world-model";
import { BUILDING_CELL } from "./buildingTemplate";
import type { ObjectLayout, Placement, Surface } from "./interiorLayout";

/** Ticket objects are a little smaller than the Greenhouse props they sit on. */
const OBJECT_SCALE = 0.9;
const RESTACK_S = 0.35;
const DRONE_SCALE = 1.6;
const HOP_S = 1.1;
const MILESTONE_ACCENTS: readonly PaletteName[] = ["sage", "tangerine", "circle", "brass", "leaf", "coral"];
const STICKER_ACCENTS: readonly PaletteName[] = ["coral", "tangerine", "circle", "sage", "brass", "leaf", "mist"];

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  matrix: THREE.Matrix4;
}

/** One style template turned into instanced parts. */
class Template {
  readonly parts: Part[] = [];
  readonly meshes: THREE.InstancedMesh[] = [];
  readonly height: number;
  readonly size = new THREE.Vector3();
  capacity = 0;
  count = 0;
  /** Ticket id per instance, for picking (bodies only). */
  readonly ids: string[] = [];

  constructor(object: THREE.Object3D) {
    object.updateMatrixWorld(true);
    object.traverse((o) => {
      if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) {
        this.parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() });
      }
    });
    const box = new THREE.Box3().setFromObject(object);
    box.getSize(this.size);
    this.height = box.max.y;
  }

  ensure(n: number, parent: THREE.Object3D, key: string) {
    if (n <= this.capacity) return;
    const capacity = Math.max(8, 2 ** Math.ceil(Math.log2(n)));
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.meshes.length = 0;
    for (const part of this.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.userData.template = key;
      mesh.userData.ids = this.ids;
      parent.add(mesh);
      this.meshes.push(mesh);
    }
    this.capacity = capacity;
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
  }
}

interface ObjectState {
  object: WorkObject;
  /** Where it rests now (local building coordinates, the stack's bottom), or null when on a pallet. */
  rest: THREE.Vector3 | null;
  /** The drawn position this frame. */
  pos: THREE.Vector3;
  /** A short ease after a re-stack. */
  ease: { from: THREE.Vector3; t: number } | null;
  /** The drone flight. */
  flight: { from: THREE.Vector3; to: THREE.Vector3; startedAt: number; until: number; retargetAt: number } | null;
  drone: THREE.Object3D | null;
  hop: { t: number; until: number; sparkle: THREE.Object3D } | null;
  anchor: THREE.Vector3;
}

export interface ObjectLayerContext {
  style: ResolvedStyle;
  /** Source time now (ms), for drone flights. */
  now: () => number;
  reducedMotion: () => boolean;
  /** The world position of the truck's cargo bed, building-local. */
  truck: THREE.Vector3;
  /** Surface heights for the furniture objects stand on. */
  surface: (surface: Surface) => number;
}

export class ObjectLayer {
  readonly group = new THREE.Group();
  readonly anchors = new Map<string, THREE.Vector3>();
  readonly #ctx: ObjectLayerContext;
  readonly #slug: string;
  readonly #templates = new Map<string, Template>();
  readonly #states = new Map<string, ObjectState>();
  readonly #celebrated = new Set<string>();
  #milestoneAccent = new Map<string, PaletteName>();
  // Scratch.
  readonly #m = new THREE.Matrix4();
  readonly #place = new THREE.Matrix4();
  readonly #q = new THREE.Quaternion();
  readonly #s = new THREE.Vector3();
  readonly #yAxis = new THREE.Vector3(0, 1, 0);

  constructor(slug: string, ctx: ObjectLayerContext) {
    this.#slug = slug;
    this.#ctx = ctx;
  }

  #template(key: ModelKey, options: ModelOptions = {}): Template {
    const id = `${key}|${options.variant ?? ""}|${options.accent ?? ""}|${options.size ? `${options.size.width.toFixed(3)},${options.size.height.toFixed(3)},${options.size.depth.toFixed(3)}` : ""}`;
    let t = this.#templates.get(id);
    if (!t) {
      t = new Template(this.#ctx.style.model(key, options));
      this.#templates.set(id, t);
    }
    return t;
  }

  #body(o: WorkObject): Template {
    return this.#template(`ticket.${o.kind}` as ModelKey);
  }

  /** Called when the model or the layout changed. */
  sync(building: Building, layout: ObjectLayout) {
    this.#milestoneAccent = new Map(building.milestones.map((m, i) => [m.id, MILESTONE_ACCENTS[i % MILESTONE_ACCENTS.length]!]));
    const seen = new Set<string>();
    // Stack heights per slot, bottom up.
    const stacked = new Map<string, number>();
    const ordered = [...building.objects].sort((a, b) => (layout.placements.get(a.ticketId)?.level ?? 0) - (layout.placements.get(b.ticketId)?.level ?? 0));
    for (const object of ordered) {
      seen.add(object.ticketId);
      const placement = layout.placements.get(object.ticketId) ?? null;
      const rest = placement ? this.#restOf(placement, stacked, this.#body(object).height * OBJECT_SCALE) : null;
      let state = this.#states.get(object.ticketId);
      if (!state) {
        const pos = rest ? rest.clone() : new THREE.Vector3();
        state = { object, rest, pos, ease: null, flight: null, drone: null, hop: null, anchor: new THREE.Vector3() };
        this.#states.set(object.ticketId, state);
      } else if (rest && state.rest && !state.flight && !object.transit && rest.distanceToSquared(state.rest) > 1e-6 && !this.#ctx.reducedMotion()) {
        state.ease = { from: state.pos.clone(), t: 0 };
      }
      state.object = object;
      state.rest = rest;
      this.#syncFlight(state, layout);
      this.#syncHop(state);
      this.anchors.set(`o:${this.#slug}:${object.ticketId}`, state.anchor);
    }
    for (const [id, state] of this.#states)
      if (!seen.has(id)) {
        this.#dropDrone(state);
        if (state.hop) state.hop.sparkle.removeFromParent();
        this.#states.delete(id);
        this.anchors.delete(`o:${this.#slug}:${id}`);
      }
  }

  #restOf(p: Placement, stacked: Map<string, number>, height: number): THREE.Vector3 {
    const below = stacked.get(p.slot) ?? 0;
    stacked.set(p.slot, below + height + 0.005);
    return new THREE.Vector3(p.x * BUILDING_CELL, this.#ctx.surface(p.surface) + below, p.z * BUILDING_CELL);
  }

  #syncFlight(state: ObjectState, layout: ObjectLayout) {
    const transit = state.object.transit;
    if (!transit) {
      if (state.flight) {
        // Landed: the model moved the object; ease from where the drone let go.
        if (state.rest && !this.#ctx.reducedMotion()) state.ease = { from: state.pos.clone(), t: 0 };
        state.flight = null;
      }
      this.#dropDrone(state);
      return;
    }
    const target = layout.targets.get(state.object.ticketId);
    const to = transit.toRoom === "truck" ? this.#ctx.truck.clone() : target ? this.#restOf(target, new Map(), 0) : state.rest?.clone() ?? state.pos.clone();
    if (target) to.y += target.level * this.#body(state.object).height * OBJECT_SCALE;
    if (!state.flight) {
      state.flight = { from: (state.rest ?? state.pos).clone(), to, startedAt: transit.startedAt, until: transit.until, retargetAt: transit.startedAt };
    } else if (state.flight.to.distanceToSquared(to) > 1e-6 || state.flight.until !== transit.until) {
      // A second move in the air: bend towards the new slot from where the package is now.
      state.flight.from.copy(state.pos);
      state.flight.to.copy(to);
      state.flight.retargetAt = Math.max(state.flight.startedAt, this.#ctx.now());
      state.flight.until = transit.until;
    }
    if (!state.drone) {
      // The style's drone inside a holder: the materialise effect scales the drone, the holder sizes it for the room.
      state.drone = new THREE.Group();
      state.drone.add(this.#ctx.style.model("drone"));
      state.drone.scale.setScalar(DRONE_SCALE);
      this.group.add(state.drone);
    }
  }

  #dropDrone(state: ObjectState) {
    if (!state.drone) return;
    state.drone.removeFromParent();
    state.drone = null;
  }

  #syncHop(state: ObjectState) {
    const until = state.object.celebrateUntil;
    const key = `${state.object.ticketId}:${until}`;
    if (until === null || this.#celebrated.has(key) || this.#ctx.reducedMotion()) return;
    this.#celebrated.add(key);
    const sparkle = this.#ctx.style.model("sparkle");
    this.group.add(sparkle);
    if (state.hop) state.hop.sparkle.removeFromParent();
    state.hop = { t: 0, until: HOP_S, sparkle };
  }

  /** True while something moves (a flight, an ease, a hop). */
  get animating(): boolean {
    for (const s of this.#states.values()) if (s.flight || s.ease || s.hop) return true;
    return false;
  }

  /** Advances motion and writes every instance. `seconds` is wall time since the last frame. */
  update(seconds: number) {
    const now = this.#ctx.now();
    const reduced = this.#ctx.reducedMotion();
    for (const state of this.#states.values()) this.#move(state, seconds, now, reduced);
    this.#regrown = false;
    this.#write();
    if (this.#regrown) this.#write();
  }

  #move(state: ObjectState, seconds: number, now: number, reduced: boolean) {
    const { pos } = state;
    if (state.flight && state.drone) {
      const f = state.flight;
      const span = Math.max(1, f.until - f.retargetAt);
      const t = THREE.MathUtils.clamp((now - f.retargetAt) / span, 0, 1);
      const whole = THREE.MathUtils.clamp((now - f.startedAt) / Math.max(1, f.until - f.startedAt), 0, 1);
      const drone = state.drone;
      if (reduced) {
        // A short fade: the drone shows at the package, the package is set down at the slot halfway.
        pos.copy(t < 0.5 ? f.from : f.to);
        drone.position.copy(pos).setY(pos.y + 0.03);
        this.#ctx.style.materialise(drone.children[0]!, t < 0.5 ? Math.min(1, t * 6) : Math.min(1, (1 - t) * 6));
      } else {
        // Descend and hook (first 15 %), arc over the walls, set down (last 15 %).
        const lift = f.retargetAt === f.startedAt ? 0.15 : 0;
        const u = THREE.MathUtils.clamp((t - lift) / (0.85 - lift), 0, 1);
        const eased = u * u * (3 - 2 * u);
        pos.lerpVectors(f.from, f.to, eased);
        const height = 1.1 + f.from.distanceTo(f.to) * 0.12;
        pos.y += Math.sin(Math.PI * eased) * height + (t < lift ? 0 : t > 0.85 ? 0 : 0.06);
        drone.position.copy(pos).setY(pos.y + 0.03 + (t < lift ? (1 - t / lift) * 0.8 : 0) + (t > 0.85 ? ((t - 0.85) / 0.15) * 0.8 : 0));
        const fade = whole < 0.1 ? whole / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;
        const body = drone.children[0]!;
        this.#ctx.style.materialise(body, fade);
        (body.userData.animate as ((s: number) => void) | undefined)?.(seconds);
      }
    } else if (state.rest) {
      if (state.ease) {
        state.ease.t += seconds / RESTACK_S;
        const u = Math.min(1, state.ease.t);
        pos.lerpVectors(state.ease.from, state.rest, u * u * (3 - 2 * u));
        if (u >= 1) state.ease = null;
      } else pos.copy(state.rest);
    }
    if (state.hop) {
      state.hop.t += seconds;
      const u = state.hop.t / state.hop.until;
      pos.y += Math.sin(Math.min(1, u * 2) * Math.PI) * 0.18;
      state.hop.sparkle.position.copy(pos).setY(pos.y + 0.3);
      state.hop.sparkle.scale.setScalar(Math.sin(Math.min(1, u) * Math.PI) * 1.4 + 0.001);
      if (u >= 1) {
        state.hop.sparkle.removeFromParent();
        state.hop = null;
      }
    }
    state.anchor.copy(pos).setY(pos.y + this.#body(state.object).height * OBJECT_SCALE + 0.12);
    if (this.group.parent) state.anchor.add(this.group.parent.position);
  }

  #write() {
    for (const t of this.#templates.values()) {
      t.count = 0;
      t.ids.length = 0;
    }
    for (const state of this.#states.values()) {
      if (!state.rest && !state.flight) continue;
      const o = state.object;
      const body = this.#body(o);
      this.#s.setScalar(OBJECT_SCALE);
      // A little deterministic turn per ticket keeps a pile from looking machined.
      this.#q.setFromAxisAngle(this.#yAxis, ((o.position * 37 + o.key.length * 11) % 13) * 0.02 - 0.12);
      this.#place.compose(state.pos, this.#q, this.#s);
      this.#put(body, o.ticketId);
      const size = { width: body.size.x + 0.02, height: body.height + 0.004, depth: body.size.z + 0.02 };
      if (o.blocked) this.#put(this.#template("ticket.strap", { size }), o.ticketId, false);
      if (o.sealed) this.#put(this.#template("ticket.seal", { size: { width: 0.07, height: size.height, depth: size.depth } }), o.ticketId, false);
      if (o.milestone) {
        const accent = this.#milestoneAccent.get(o.milestone.id) ?? "sage";
        this.#put(this.#template("ticket.band", { size: { width: 0.05, height: size.height, depth: size.depth }, accent }), o.ticketId, false, -body.size.x * 0.3);
      }
      if (o.priorityTag) {
        const tag = this.#template("ticket.tag", { variant: o.priorityTag, accent: o.priorityTag === "urgent" ? "coral" : "tangerine" });
        this.#put(tag, o.ticketId, false, body.size.x * 0.4, body.height, -body.size.z * 0.3);
      }
      o.labels.slice(0, 3).forEach((label, i) => {
        const sticker = this.#template("ticket.sticker", label === "prop" ? { variant: "star" } : { accent: STICKER_ACCENTS[hash(label) % STICKER_ACCENTS.length]! });
        this.#put(sticker, o.ticketId, false, -body.size.x * 0.25 + i * 0.07, body.height, body.size.z * 0.2);
      });
      if (o.nameTag || o.waitingOnHuman) this.#put(this.#template("ticket.nametag"), o.ticketId, false, body.size.x * 0.45, body.height * 0.2, body.size.z * 0.5);
      if (o.speechMarkUntil !== null) this.#put(this.#template("ticket.speech"), o.ticketId, false, -body.size.x * 0.3, body.height + 0.12, 0);
    }
    for (const t of this.#templates.values())
      for (const mesh of t.meshes) {
        mesh.count = t.count;
        mesh.instanceMatrix.needsUpdate = true;
      }
  }

  /** Adds one instance of a template, offset in the object's local frame. */
  #put(t: Template, id: string, body = true, dx = 0, dy = 0, dz = 0) {
    const index = t.count;
    if (index >= t.capacity) {
      // Growing replaces the meshes, so this frame's earlier instances are written again.
      t.ensure(index + 1, this.group, "");
      this.#regrown = true;
    }
    this.#m.makeTranslation(dx, dy, dz).premultiply(this.#place);
    for (let i = 0; i < t.parts.length; i++) {
      this.#scratch.multiplyMatrices(this.#m, t.parts[i]!.matrix);
      t.meshes[i]!.setMatrixAt(index, this.#scratch);
    }
    if (body) t.ids[index] = id;
    t.count = index + 1;
  }
  readonly #scratch = new THREE.Matrix4();
  #regrown = false;

  /** The ticket under a ray hit on a body instance, or null. */
  pick(hit: THREE.Intersection): string | null {
    const ids = hit.object.userData.ids as string[] | undefined;
    return ids && hit.instanceId !== undefined ? (ids[hit.instanceId] ?? null) : null;
  }

  /** Body meshes, for raycasting. */
  pickables(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    for (const [key, t] of this.#templates) if (key.startsWith("ticket.task|") || key.startsWith("ticket.feature|") || key.startsWith("ticket.bug|") || key.startsWith("ticket.question|")) list.push(...t.meshes);
    return list;
  }

  dispose() {
    for (const t of this.#templates.values()) t.dispose();
    this.#templates.clear();
    for (const state of this.#states.values()) {
      this.#dropDrone(state);
      state.hop?.sparkle.removeFromParent();
    }
    this.#states.clear();
    this.group.removeFromParent();
  }
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
