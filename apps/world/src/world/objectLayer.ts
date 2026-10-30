/* Work objects of the entered building, drawn instanced: each style template (a ticket look, a tag, a strap, …) is
   baked into one mesh per material look first (mergeStatic), then drawn as one InstancedMesh per baked mesh, so a pile
   of fifty tickets costs a handful of draw calls and a template a call or two. The ticket drone carries flying
   objects along an arc in source time; a re-stack eases over a short tween; a person's move to done hops once with a
   sparkle. A ticket a person turned down (Done as "won't do") gets no hop and no sparkle: it is set aside, turned
   askew, with one dark band struck across it. Under reduced motion flights are a short fade, nothing hops and the turned-down
   object is askew at once. A package a person carries into Done (`transit.carrier` "person") gets no drone: it waits
   where it stood until the building view says the person holds it (`carry`), rides in their hands, and stands on the
   Done rack once they have put it down (`deliver`), whatever the model's own clock says meanwhile. The frame path
   allocates nothing. */
import * as THREE from "three";
import { useInstancedMaterials } from "./instancedMaterial.ts";
import { mergeStatic } from "./mergeStatic.ts";
import type { ModelKey, ModelOptions, PaletteName, ResolvedStyle, StyleTheme } from "@crewhub/world-style";
import type { Building, ObjectLook, WorkObject } from "@crewhub/world-model";
import { BUILDING_CELL } from "./buildingTemplate.ts";
import type { ObjectLayout, Placement, Surface } from "./interiorLayout.ts";
import { MOTE_OPACITY, MOTE_SIZE, MOTE_TOWARDS_INK, VEIL_OPACITY, VEIL_TOWARDS_INK, mote, moteCount, type MotePlace } from "./dust.ts";

/** Ticket objects at the size of the Greenhouse props they sit on, so the work reads first among the desk things. */
const OBJECT_SCALE = 1;
const RESTACK_S = 0.35;
const DRONE_SCALE = 1.6;
const HOP_S = 1.1;
/** A turned-down object is set aside slowly: this long for the turn, this far (radians) off the pile's line. */
const ASIDE_S = 1.6;
const ASIDE_TURN = 0.62;
const ASIDE_STRIKE: PaletteName = "slate";
const MILESTONE_ACCENTS: readonly PaletteName[] = ["sage", "tangerine", "circle", "brass", "leaf", "coral"];
const STICKER_ACCENTS: readonly PaletteName[] = ["coral", "tangerine", "circle", "sage", "brass", "leaf", "mist"];
/** The style's ticket model for each look the model gives a package (a grill reads as mail: the question's envelope). */
const BODIES: Record<ObjectLook, ModelKey> = { folder: "ticket.task", box: "ticket.feature", "bug-crate": "ticket.bug", envelope: "ticket.question" };

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
  /** Whether its instances cast and receive shadows (the dust's veil and motes do not). */
  shadow = true;
  /** The geometry the bake made (the template's own). */
  readonly #baked: THREE.BufferGeometry[];

  constructor(object: THREE.Object3D) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    box.getSize(this.size);
    this.height = box.max.y;
    // One mesh per material look instead of one per part; the data stays in memory, bodies are raycast for picking.
    const root = new THREE.Group();
    root.add(object);
    this.#baked = mergeStatic(root, { keepData: true });
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) {
        this.parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() });
      }
    });
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
      mesh.castShadow = this.shadow;
      mesh.receiveShadow = this.shadow;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.userData.template = key;
      mesh.userData.ids = this.ids;
      // Its own twin of the part's material (instancedMaterial.ts): the furniture draws the source whole.
      useInstancedMaterials(mesh);
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
    for (const geometry of this.#baked) geometry.dispose();
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
  /** How far a turned-down object has been set aside, 0 to 1. */
  aside: number;
  /** How far the dust of a quiet ticket has settled, 0 to 1 (wall time; 1 at once under reduced motion). */
  dust: number;
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
  /** The rise from one rack shelf to the next: an object on a "shelf" stands `level` shelves up, not on a stack. */
  shelfPitch: () => number;
  /** The theme now: the dust's grey is the style's mist in that theme (dust.ts). */
  theme: () => StyleTheme;
}

export class ObjectLayer {
  readonly group = new THREE.Group();
  readonly anchors = new Map<string, THREE.Vector3>();
  readonly #ctx: ObjectLayerContext;
  readonly #slug: string;
  readonly #templates = new Map<string, Template>();
  readonly #states = new Map<string, ObjectState>();
  /** The last celebration played per ticket (its `celebrateUntil`, source time). An object's entry outlives its state
      until that time has passed, so a ticket that leaves and comes back inside its celebration does not hop twice
      (round 47, the review's F10); then it goes at the next sync (round 45: one entry per ticket, never a growing set). */
  readonly #celebrated = new Map<string, number>();
  /** Packages in a person's hands: where the carry anchor is this frame, building-local. */
  readonly #carried = new Map<string, THREE.Vector3>();
  /** Packages a person has put on the Done rack before the model landed them there. */
  readonly #delivered = new Set<string>();
  #milestoneAccent = new Map<string, PaletteName>();
  /** Props riding on a work object, by ticket key (plan 6.3): stickers and small figures. */
  #riders = new Map<string, THREE.Object3D[]>();
  /** A quiet package's dust (dust.ts): the veil's and the motes' materials (unlit, so their grey is the grey whatever
      the sun does; one each for every package), wall time for the motes' drift, and the theme they were last coloured
      for (null before the first frame). */
  readonly #veil = new THREE.MeshBasicMaterial({ transparent: true, opacity: VEIL_OPACITY, depthWrite: false, toneMapped: false });
  readonly #moteMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: MOTE_OPACITY, depthWrite: false, toneMapped: false });
  #wall = 0;
  #theme: StyleTheme | null = null;
  readonly #motePlace: MotePlace = { x: 0, y: 0, z: 0 };
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
    return this.#template(BODIES[o.look]);
  }

  /**
   * The dust on a package of that size: the layer's own grey veil, a translucent box a shade wider than the body that
   * greys its top and its sides too, so the package reads as quiet from the hall's distance, where a film on the top
   * alone is a sliver (round 9). No style model: the style's Object3D count stays what it is. Its grey is the style's
   * mist, a way towards its ink, in the theme (`#recolour`).
   */
  #dust(body: Template): Template {
    const id = `dust|${body.size.x.toFixed(3)},${body.height.toFixed(3)},${body.size.z.toFixed(3)}`;
    let t = this.#templates.get(id);
    if (!t) {
      const height = body.height + 0.012;
      const veil = new THREE.Mesh(new THREE.BoxGeometry(body.size.x + 0.024, height, body.size.z + 0.024), this.#veil);
      veil.position.y = height / 2 - 0.002;
      t = new Template(veil);
      t.shadow = false;
      this.#templates.set(id, t);
    }
    return t;
  }

  /** The dust's colours follow the theme: the veil's grey (the style's mist a way towards its ink) and the motes' (a
      lighter grey by day; chalk in lamplight, where a grey speck would vanish on a dim package). Both materials are
      unlit and left out of the tone mapping (dust.ts says why). Allocates only on a theme change. */
  #recolour(theme: StyleTheme) {
    this.#theme = theme;
    const style = this.#ctx.style;
    const mist = style.color("mist", theme);
    const ink = style.color("ink", theme);
    this.#veil.color.copy(mist).lerp(ink, VEIL_TOWARDS_INK[theme]);
    this.#moteMaterial.color.copy(theme === "lamplight" ? style.color("chalk", theme) : mist.clone().lerp(ink, MOTE_TOWARDS_INK));
    // The bake may have given a template a copy of the material: every drawn one follows.
    for (const [id, t] of this.#templates)
      if (id === "mote" || id.startsWith("dust|"))
        for (const mesh of t.meshes) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m instanceof THREE.MeshBasicMaterial) m.color.copy(id === "mote" ? this.#moteMaterial.color : this.#veil.color);
  }

  /**
   * A mote: a small unlit sphere in the dust's pale colour, drawn instanced like every other decoration (a Points
   * object would need the camera to size itself: the town's camera is orthographic). One template for every package.
   */
  #mote(): Template {
    let t = this.#templates.get("mote");
    if (!t) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(MOTE_SIZE / 2, 6, 4), this.#moteMaterial);
      sphere.position.y = MOTE_SIZE / 2;
      t = new Template(sphere);
      t.shadow = false;
      this.#templates.set("mote", t);
    }
    return t;
  }

  /** Test-facing: how many tickets' last celebration the layer remembers (one per object it shows at most, and a gone
      object's until its celebration has passed). */
  get celebratedCount(): number {
    return this.#celebrated.size;
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
        // One that was turned down before it came into view is askew already; a fresh rejection turns in view.
        const aside = object.rejected && object.turnedDownUntil === null ? 1 : 0;
        state = { object, rest, pos, ease: null, flight: null, drone: null, hop: null, aside, dust: 0, anchor: new THREE.Vector3() };
        this.#states.set(object.ticketId, state);
      } else if (rest && state.rest && !state.flight && !object.transit && rest.distanceToSquared(state.rest) > 1e-6 && !this.#ctx.reducedMotion()) {
        state.ease = { from: state.pos.clone(), t: 0 };
      }
      state.object = object;
      state.rest = rest;
      if (!object.transit) this.#delivered.delete(object.ticketId);
      this.#syncFlight(state, layout);
      this.#syncHop(state);
      this.anchors.set(`o:${this.#slug}:${object.ticketId}`, state.anchor);
    }
    for (const [id, state] of this.#states)
      if (!seen.has(id)) {
        this.#dropDrone(state);
        if (state.hop) state.hop.sparkle.removeFromParent();
        this.#states.delete(id);
        this.#carried.delete(id);
        this.#delivered.delete(id);
        this.anchors.delete(`o:${this.#slug}:${id}`);
      }
    const now = this.#ctx.now();
    for (const [id, until] of this.#celebrated) if (until <= now && !this.#states.has(id)) this.#celebrated.delete(id);
  }

  /**
   * A person holds the package: `at` is their carry anchor this frame (building-local; copied, not kept), null when
   * they let go. On release the package eases to where the model has it.
   */
  carry(ticketId: string, at: THREE.Vector3 | null) {
    const held = this.#carried.get(ticketId);
    if (at) {
      if (held) held.copy(at);
      else this.#carried.set(ticketId, at.clone());
      return;
    }
    if (!held) return;
    this.#carried.delete(ticketId);
    const state = this.#states.get(ticketId);
    if (state && !this.#ctx.reducedMotion()) state.ease = { from: state.pos.clone(), t: 0 };
    if (state) this.#syncHop(state);
  }

  /** The person has put the package on the Done rack: it is drawn at its new slot, even before the model lands it. */
  deliver(ticketId: string) {
    this.#delivered.add(ticketId);
  }

  /** Props that ride on work objects, by ticket key. They follow the object onto desks, piles and the drone's hook. */
  setRiders(riders: Map<string, THREE.Object3D[]>) {
    for (const list of this.#riders.values()) for (const rider of list) rider.removeFromParent();
    this.#riders = riders;
    for (const list of riders.values())
      for (const rider of list) {
        rider.visible = false;
        this.group.add(rider);
      }
  }

  #restOf(p: Placement, stacked: Map<string, number>, height: number): THREE.Vector3 {
    // On a rack's shelves the level is the shelf; elsewhere the objects below it in the same stack.
    if (p.surface === "shelf") return new THREE.Vector3(p.x * BUILDING_CELL, this.#ctx.surface("shelf") + p.level * this.#ctx.shelfPitch(), p.z * BUILDING_CELL);
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
    if (target && target.surface !== "shelf") to.y += target.level * this.#body(state.object).height * OBJECT_SCALE;
    if (transit.carrier === "person") {
      // No drone: the package waits where it stood, or stands on the Done rack once the person has put it down.
      this.#dropDrone(state);
      if (!state.flight) state.flight = { from: (state.rest ?? state.pos).clone(), to, startedAt: transit.startedAt, until: transit.until, retargetAt: transit.startedAt };
      else state.flight.to.copy(to);
      return;
    }
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
      // Its soft blob shadow stays on the floor under it, smaller and lighter the higher it flies.
      const shadow = this.#ctx.style.model("town.contact-shadow", { size: { width: 0.05, height: 0, depth: 0.05 } });
      shadow.visible = false;
      state.drone.userData.shadow = shadow;
      this.group.add(shadow);
    }
  }

  #dropDrone(state: ObjectState) {
    if (!state.drone) return;
    (state.drone.userData.shadow as THREE.Object3D | undefined)?.removeFromParent();
    state.drone.removeFromParent();
    state.drone = null;
  }

  #syncHop(state: ObjectState) {
    const until = state.object.celebrateUntil;
    // A package a person carries hops once it is out of their hands, on the rack. One entry per ticket, its last
    // celebration: a set of every `ticket:until` pair grew with every celebration a long session ever showed.
    if (until === null || this.#celebrated.get(state.object.ticketId) === until || this.#ctx.reducedMotion() || state.object.transit || this.#carried.has(state.object.ticketId)) return;
    this.#celebrated.set(state.object.ticketId, until);
    const sparkle = this.#ctx.style.model("sparkle");
    this.group.add(sparkle);
    if (state.hop) state.hop.sparkle.removeFromParent();
    state.hop = { t: 0, until: HOP_S, sparkle };
  }

  /** True while something moves (a flight, an ease, a hop, a turned-down object being set aside, dust settling or its motes drifting). */
  get animating(): boolean {
    if (this.#carried.size) return true;
    const motes = moteCount(this.#ctx.reducedMotion()) > 0;
    for (const s of this.#states.values()) if ((s.flight && s.drone) || s.ease || s.hop || (s.object.rejected && s.aside < 1) || (s.object.quiet !== null && (s.dust < 1 || motes))) return true;
    return false;
  }

  /** Advances motion and writes every instance. `seconds` is wall time since the last frame. */
  update(seconds: number) {
    const now = this.#ctx.now();
    const reduced = this.#ctx.reducedMotion();
    this.#wall += seconds;
    const theme = this.#ctx.theme();
    if (theme !== this.#theme) this.#recolour(theme);
    for (const state of this.#states.values()) this.#move(state, seconds, now, reduced);
    this.#regrown = false;
    this.#write(reduced);
    if (this.#regrown) this.#write(reduced);
  }

  #move(state: ObjectState, seconds: number, now: number, reduced: boolean) {
    const { pos } = state;
    // A quiet ticket's dust settles over a second and a half; it lifts at once when the ticket changes.
    if (state.object.quiet !== null) state.dust = reduced ? 1 : Math.min(1, state.dust + seconds / 1.4);
    else state.dust = 0;
    const carried = this.#carried.get(state.object.ticketId);
    if (carried) {
      // In a person's hands: wherever they are, until they let go.
      pos.copy(carried);
      state.ease = null;
    } else if (state.flight && !state.drone) {
      // A person's package, not in hand: on its old place, or on the Done rack once delivered.
      pos.copy(this.#delivered.has(state.object.ticketId) ? state.flight.to : state.flight.from);
    } else if (state.flight && state.drone) {
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
        const shadow = drone.userData.shadow as THREE.Object3D | undefined;
        if (shadow) {
          const floor = this.#ctx.surface("floor");
          shadow.visible = fade > 0.02;
          shadow.position.set(drone.position.x, floor + 0.004, drone.position.z);
          shadow.scale.setScalar((0.9 * Math.max(0.001, fade)) / (1 + Math.max(0, drone.position.y - floor) * 0.45));
        }
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
    // Set aside once it has landed: a slow turn, no hop. Taken back (reopened, or a plain Done after all), it straightens.
    if (!state.object.rejected) state.aside = 0;
    else if (!state.flight && !carried && state.aside < 1) state.aside = reduced ? 1 : Math.min(1, state.aside + seconds / ASIDE_S);
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
    const top = this.#body(state.object).height * OBJECT_SCALE;
    const riders = this.#riders.get(state.object.key);
    if (riders)
      riders.forEach((rider, i) => {
        rider.visible = !!(state.rest || state.flight);
        rider.position.copy(pos);
        rider.position.y += top;
        rider.position.x += (i - (riders.length - 1) / 2) * 0.1;
      });
    state.anchor.copy(pos).setY(pos.y + top + 0.12);
    if (this.group.parent) state.anchor.add(this.group.parent.position);
  }

  #write(reduced: boolean) {
    const motes = moteCount(reduced);
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
      const aside = state.aside * state.aside * (3 - 2 * state.aside);
      this.#q.setFromAxisAngle(this.#yAxis, ((o.position * 37 + o.key.length * 11) % 13) * 0.02 - 0.12 + aside * ASIDE_TURN);
      this.#place.compose(state.pos, this.#q, this.#s);
      this.#visit(o, body, state.dust, motes, true);
    }
    for (const t of this.#templates.values())
      for (const mesh of t.meshes) {
        mesh.count = t.count;
        mesh.instanceMatrix.needsUpdate = true;
      }
  }

  /**
   * Every instance one object draws: its body and its decorations (dust and motes, the strike, the strap, the seal, the
   * milestone band, the priority tag, the stickers, the name tag, the speech mark), each through `#emit`: written
   * (`write`, the frame path, `#place` set) or only counted (`prepare`, ahead of the enter). One list, so what is
   * made ahead is what the frame draws.
   */
  #visit(o: WorkObject, body: Template, dust: number, motes: number, write: boolean) {
    this.#emit(write, body, o.ticketId);
    const size = { width: body.size.x + 0.02, height: body.height + 0.004, depth: body.size.z + 0.02 };
    // `ticket.quiet`: the grey veil of dust over the package, settling from a little above it, and a few motes
    // hovering low before its face in wall time (none under reduced motion); the clock tag is a label.
    if (o.quiet !== null) {
      this.#emit(write, this.#dust(body), o.ticketId, false, 0, (1 - dust) * 0.12, 0);
      if (motes > 0 && dust > 0) {
        const seed = hash(o.ticketId);
        for (let i = 0; i < motes; i++) {
          const m = mote(seed, i, this.#wall, body.size, this.#motePlace);
          this.#emit(write, this.#mote(), o.ticketId, false, m.x, body.height + m.y * dust, m.z);
        }
      }
    }
    // Struck through: one thin dark band from corner to corner (a milestone band runs straight and is coloured).
    if (o.rejected) {
      const strike = { width: Math.hypot(body.size.x, body.size.z) * 0.94, height: size.height + 0.004, depth: 0.03 };
      this.#emit(write, this.#template("ticket.band", { size: strike, accent: ASIDE_STRIKE }), o.ticketId, false, 0, 0, 0, Math.atan2(body.size.z, body.size.x));
    }
    if (o.blocked) this.#emit(write, this.#template("ticket.strap", { size }), o.ticketId, false);
    if (o.sealed) this.#emit(write, this.#template("ticket.seal", { size: { width: 0.07, height: size.height, depth: size.depth } }), o.ticketId, false);
    if (o.milestone) {
      const accent = this.#milestoneAccent.get(o.milestone.id) ?? "sage";
      this.#emit(write, this.#template("ticket.band", { size: { width: 0.05, height: size.height, depth: size.depth }, accent }), o.ticketId, false, -body.size.x * 0.3);
    }
    if (o.priorityTag) {
      const tag = this.#template("ticket.tag", { variant: o.priorityTag, accent: o.priorityTag === "urgent" ? "coral" : "tangerine" });
      this.#emit(write, tag, o.ticketId, false, body.size.x * 0.4, body.height, -body.size.z * 0.3);
    }
    o.labels.slice(0, 3).forEach((label, i) => {
      const sticker = this.#template("ticket.sticker", label === "prop" ? { variant: "star" } : { accent: STICKER_ACCENTS[hash(label) % STICKER_ACCENTS.length]! });
      this.#emit(write, sticker, o.ticketId, false, -body.size.x * 0.25 + i * 0.07, body.height, body.size.z * 0.2);
    });
    if (o.nameTag || o.waitingOnHuman) this.#emit(write, this.#template("ticket.nametag"), o.ticketId, false, body.size.x * 0.45, body.height * 0.2, body.size.z * 0.5);
    if (o.speechMarkUntil !== null) this.#emit(write, this.#template("ticket.speech"), o.ticketId, false, -body.size.x * 0.3, body.height + 0.12, 0);
  }

  #emit(write: boolean, t: Template, id: string, body = true, dx = 0, dy = 0, dz = 0, yaw = 0) {
    if (write) this.#put(t, id, body, dx, dy, dz, yaw);
    else this.#counts.set(t, (this.#counts.get(t) ?? 0) + 1);
  }
  readonly #counts = new Map<Template, number>();

  /**
   * Ahead of the enter (buildingView.ts `prepareInside`, idle time): bakes every template the building's objects draw
   * with and makes its instanced meshes at the capacity they need (count 0, under the hidden group), so the frame of
   * the enter neither bakes nor grows them and the renderer can compile their program before it. Nothing about the
   * objects' states: those are made at the enter, as before. Yields after every object whose templates it baked (a
   * bake is a merge); answers true when it made something.
   */
  *prepare(building: Building): Generator<void, boolean> {
    this.#milestoneAccent = new Map(building.milestones.map((m, i) => [m.id, MILESTONE_ACCENTS[i % MILESTONE_ACCENTS.length]!]));
    const before = this.#templates.size;
    let templates = before;
    this.#counts.clear();
    // Dust at its fullest: the veil and every mote, as a package that has stood a while draws them.
    for (const o of building.objects) {
      this.#visit(o, this.#body(o), 1, moteCount(this.#ctx.reducedMotion()), false);
      if (this.#templates.size !== templates) {
        templates = this.#templates.size;
        yield;
      }
    }
    let grown = false;
    for (const [t, n] of this.#counts)
      if (n > t.capacity) {
        t.ensure(n, this.group, "");
        grown = true;
      }
    this.#counts.clear();
    return grown || templates !== before;
  }

  /** How many templates stand baked and how many instanced meshes they hold (for the tests and the tools). */
  get baked(): { templates: number; meshes: number } {
    let meshes = 0;
    for (const t of this.#templates.values()) meshes += t.meshes.length;
    return { templates: this.#templates.size, meshes };
  }

  /** Adds one instance of a template, offset (and turned by `yaw`) in the object's local frame. */
  #put(t: Template, id: string, body = true, dx = 0, dy = 0, dz = 0, yaw = 0) {
    const index = t.count;
    if (index >= t.capacity) {
      // Growing replaces the meshes, so this frame's earlier instances are written again.
      t.ensure(index + 1, this.group, "");
      this.#regrown = true;
    }
    if (yaw === 0) this.#m.makeTranslation(dx, dy, dz);
    else this.#m.makeRotationY(yaw).setPosition(dx, dy, dz);
    this.#m.premultiply(this.#place);
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
    this.#veil.dispose();
    this.#moteMaterial.dispose();
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
