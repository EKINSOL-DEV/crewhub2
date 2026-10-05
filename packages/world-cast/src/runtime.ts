/* The figure runtime: turns a cast's data (a `FigureSpec`) into `FigureHandle`s, drawing only through the style's
   `FigureKit`. It knows no style and no cast: joints are groups, parts are the kit's meshes, a state picks parts,
   a still pose, a set of motions and the looks. A figure only re-poses and re-skins when its state changes, and its
   `update` allocates nothing. */
import * as THREE from "three";
import { figureColor, hashKey, perchPlacement, wave, type PerchPlacement } from "./figure.ts";
import type {
  Cast,
  CastManifest,
  FigureDetail,
  FigureExtension,
  FigureHandle,
  FigureHighlight,
  FigureKit,
  FigureLook,
  FigureOptions,
  FigurePartSpec,
  FigureSpec,
  FigureState,
  JointPose,
  Motion,
  MotionWave,
  PerchStep,
  WorkPlace,
} from "./index.ts";

const DEG = Math.PI / 180;
/** A joint's nine channels, in this order: rotation, offset, scale (x, y, z each). */
const CHANNELS = ["rotation.x", "rotation.y", "rotation.z", "offset.x", "offset.y", "offset.z", "scale.x", "scale.y", "scale.z"];
/** A stale figure fades this far towards the kit's `stale` grey and is a little see-through; a proxy is an echo. */
const STALE_FADE = 0.75;
const STALE_OPACITY = 0.8;
const PROXY_OPACITY = 0.35;
/** A seeded glance's beat stretches by up to this share of its period. */
const BEAT_STRETCH = 0.6;
/** Getting on or off a perch: seconds per figure unit of the way (at least `HOP_MIN`), and how high the hop arcs. */
const HOP_PACE = 0.32;
const HOP_MIN = 0.22;
const HOP_ARC = 0.22;

interface Joint {
  object: THREE.Object3D;
  rest: readonly [number, number, number];
  /** The still pose now and the pose with this frame's motion, nine channels each (rotations in radians). */
  base: Float32Array;
  now: Float32Array;
  /** Which of rotation (1), offset (2) and scale (4) the motions of the state now move: only those are written. */
  moves: number;
}

interface Part {
  mesh: THREE.Mesh;
  spec: FigurePartSpec;
  color: string;
  glow: number | string | undefined;
  /** The shared material of its look now; a proxy or a stale figure draws its own copy of it. */
  material: THREE.Material;
}

interface Wave {
  joint: Joint;
  channel: number;
  kind: MotionWave;
  amplitude: number;
  period: number;
  phase: number;
  /** Seconds added to the figure's clock (a seeded motion), else 0. */
  offset: number;
  rests: boolean;
}

function writeJoint(joint: Joint, values: Float32Array, what = 7) {
  const o = joint.object;
  if (what & 1) o.rotation.set(values[0]!, values[1]!, values[2]!);
  if (what & 2) o.position.set(joint.rest[0] + values[3]!, joint.rest[1] + values[4]!, joint.rest[2] + values[5]!);
  if (what & 4) o.scale.set(values[6]!, values[7]!, values[8]!);
}

function sameState(a: FigureState, b: FigureState): boolean {
  return a.activity === b.activity && a.waiting === b.waiting && a.alert === b.alert && a.proxy === b.proxy && a.carrying === b.carrying;
}

function figure(spec: FigureSpec, kit: FigureKit, options: FigureOptions, extend: FigureExtension | undefined): FigureHandle {
  const root = new THREE.Group();
  // The figure itself rides in `body`, so a perch can lift, move and turn it while the renderer keeps `root` on the
  // floor; its step stands beside it in `root`.
  const body = new THREE.Group();
  const shadow = kit.contactShadow(spec.anchors.ground);
  const halo = kit.halo(spec.anchors.ground);
  body.add(shadow, halo.object);
  root.add(body);

  const joints = new Map<string, Joint>();
  const objects = new Map<string, THREE.Object3D>([["root", body]]);
  for (const j of spec.joints) {
    const object = new THREE.Group();
    object.position.set(...j.position);
    (objects.get(j.parent ?? "root") ?? body).add(object);
    objects.set(j.id, object);
    joints.set(j.id, { object, rest: j.position, base: new Float32Array(9), now: new Float32Array(9), moves: 0 });
  }

  const seed = { key: options.key, role: options.role, accent: options.accent };
  const parts: Part[] = [];
  const named = new Map<string, THREE.Mesh>();
  for (const part of spec.parts) {
    if (part.roles && !part.roles.includes(options.role)) continue;
    const color = figureColor(spec, part.color, seed);
    const mesh = kit.part(part, color);
    (objects.get(part.joint ?? "root") ?? body).add(mesh);
    parts.push({ mesh, spec: part, color, glow: typeof part.glow === "string" ? figureColor(spec, part.glow, seed) : part.glow, material: mesh.material as THREE.Material });
    if (part.id) named.set(part.id, mesh);
  }

  const clock = hashKey(options.key) % 1000;
  const side = hashKey(`${options.key}:side`) % 2 ? 1 : -1;
  const stretch = 1 + (BEAT_STRETCH * (hashKey(`${options.key}:beat`) % 41)) / 40;
  const compile = (list: readonly Motion[] | undefined): Wave[] =>
    (list ?? []).flatMap((m) => {
      const joint = joints.get(m.joint);
      const channel = CHANNELS.indexOf(m.channel);
      if (!joint || channel < 0) return [];
      return [
        {
          joint,
          channel,
          kind: m.wave,
          amplitude: m.amplitude * (channel < 3 ? DEG : 1) * (m.sided ? side : 1),
          period: m.period * (m.seeded && m.wave === "glance" ? stretch : 1),
          phase: m.phase ?? 0,
          offset: m.seeded ? clock : 0,
          rests: m.rests === true,
        },
      ];
    });
  const compiled = new Map<string, Wave[]>();
  for (const [key, list] of Object.entries(spec.motions)) compiled.set(key, compile(list));
  const haloColor = spec.halo === undefined ? null : figureColor(spec, spec.halo, seed);
  const stale = new THREE.Color();

  let state: FigureState = { activity: "idle", waiting: false, alert: false, proxy: false, carrying: false };
  let detail: FigureDetail = "near";
  let highlight: FigureHighlight = "none";
  let time = 0;
  let haloOn = false;
  /** The motions of the state now, the joints they move, and the glance the resting motions rest for. */
  const waves: Wave[] = [];
  const moving: Joint[] = [];
  let glance: Wave | null = null;
  /** Materials this figure owns (the see-through or greyed copies), by the shared material they stand in for. */
  const owned = new Map<THREE.Material, THREE.Material>();

  const layer = (base: Float32Array, pose: JointPose | undefined) => {
    if (!pose) return;
    if (pose.rotation) for (let i = 0; i < 3; i++) base[i] = pose.rotation[i]! * DEG;
    if (pose.offset) for (let i = 0; i < 3; i++) base[3 + i] = pose.offset[i]!;
    if (pose.scale) for (let i = 0; i < 3; i++) base[6 + i] = pose.scale[i]!;
  };

  /* The perch: where the figure is going (`perched`, null for the floor), the hop there, and the steps built so far. */
  let place: WorkPlace | null = null;
  let perched: PerchPlacement | null = null;
  const hop = { from: new THREE.Vector3(), to: new THREE.Vector3(), turnFrom: 0, turnTo: 0, t: 1, seconds: HOP_MIN };
  const steps = new Map<PerchStep, THREE.Group>();
  /** The step shown now (it grows as the figure gets on and goes as it gets off) and the one being left. */
  let step: THREE.Group | null = null;
  let leaving: THREE.Group | null = null;
  const stepOf = (spec_: PerchStep): THREE.Group => {
    let group = steps.get(spec_);
    if (!group) {
      group = new THREE.Group();
      for (const part of spec_.parts) group.add(kit.part(part, figureColor(spec, part.color, seed)));
      // A step is picked as its figure is.
      group.traverse((o) => Object.assign(o.userData, root.userData));
      steps.set(spec_, group);
      root.add(group);
    }
    return group;
  };
  /** The hop at `t` (0 to 1): the body on its way, the steps growing and going. */
  const settle = (t: number) => {
    const eased = t * t * (3 - 2 * t);
    body.position.lerpVectors(hop.from, hop.to, eased);
    if (t < 1) body.position.y += Math.sin(Math.PI * t) * HOP_ARC;
    body.rotation.y = hop.turnFrom + (hop.turnTo - hop.turnFrom) * eased;
    if (step) step.scale.setScalar(Math.max(0.001, Math.min(1, t * 2.5)));
    if (leaving) {
      leaving.scale.setScalar(Math.max(0.001, 1 - eased));
      if (t >= 1) {
        leaving.visible = false;
        leaving = null;
      }
    }
  };

  /** The still pose of the state, and the motions that play over it. Walking wins: no waiting pose or motion then. */
  const pose = () => {
    const asks = state.waiting && state.activity !== "walking";
    for (const [id, joint] of joints) {
      joint.base.fill(0, 0, 6).fill(1, 6);
      joint.moves = 0;
      layer(joint.base, spec.poses[state.activity]?.[id]);
      if (perched) layer(joint.base, perched.perch.pose?.[id]);
      if (asks) layer(joint.base, spec.poses.waiting?.[id]);
      if (state.carrying) layer(joint.base, spec.poses.carrying?.[id]);
      writeJoint(joint, joint.base);
    }
    waves.length = 0;
    moving.length = 0;
    glance = null;
    for (const key of ["always", state.activity, asks ? "waiting" : ""])
      for (const w of compiled.get(key) ?? []) {
        waves.push(w);
        if (!moving.includes(w.joint)) moving.push(w.joint);
        w.joint.moves |= 1 << Math.floor(w.channel / 3);
        if (w.kind === "glance" && !glance) glance = w;
      }
    haloOn = state.alert || (haloColor !== null && (state.waiting || state.activity === "blocked"));
    halo.set(haloOn, state.alert || haloColor === null ? "alert" : haloColor);
    shadow.visible = !state.proxy;
  };

  const looks = spec.looks ?? {};
  const lookOf = (part: Part, look: FigureLook | undefined, into: { color: string; glow: number | string | undefined }) => {
    const change = part.spec.id !== undefined ? look?.parts[part.spec.id] : undefined;
    if (!change) return;
    if (change.color !== undefined) into.color = figureColor(spec, change.color, seed);
    if (change.glow !== undefined) into.glow = typeof change.glow === "string" ? figureColor(spec, change.glow, seed) : change.glow;
  };
  const look = { color: "", glow: undefined as number | string | undefined };

  /** Which parts show, and in which material: the looks of the state, then the proxy's or the stale figure's own copy. */
  const skin = () => {
    const faded = state.proxy || state.activity === "stale";
    for (const m of owned.values()) m.dispose();
    owned.clear();
    if (faded) stale.set(kit.hex("stale"));
    for (const part of parts) {
      const s = part.spec;
      part.mesh.visible =
        (detail === "near" || s.detail !== "near") &&
        (!s.activities || s.activities.includes(state.activity)) &&
        (s.waiting === undefined || s.waiting === state.waiting) &&
        (s.carrying === undefined || s.carrying === state.carrying);
      look.color = part.color;
      look.glow = part.glow;
      if (detail === "near" && !faded) lookOf(part, looks.near, look);
      lookOf(part, looks[state.activity], look);
      if (state.waiting) lookOf(part, looks.waiting, look);
      if (state.alert) lookOf(part, looks.alert, look);
      if (highlight !== "none") lookOf(part, looks[highlight], look);
      part.material = kit.material(look.color, look.glow ? { glow: look.glow } : undefined);
      part.mesh.castShadow = !state.proxy && detail === "near";
      if (!faded) {
        part.mesh.material = part.material;
        continue;
      }
      let copy = owned.get(part.material);
      if (!copy) {
        const c = (part.material as THREE.MeshStandardMaterial).clone();
        if (state.activity === "stale") c.color.lerp(stale, STALE_FADE);
        c.transparent = true;
        c.opacity = state.proxy ? PROXY_OPACITY : STALE_OPACITY;
        c.depthWrite = !state.proxy;
        owned.set(part.material, c);
        copy = c;
      }
      part.mesh.material = copy;
    }
  };

  const extension =
    extend?.({ options, kit, joints: objects, parts: named, state: () => state, detail: () => detail }) ?? null;

  pose();
  skin();

  return {
    object: root,
    body,
    anchors: spec.anchors,
    setPerch(next, cut = false) {
      if (next === place && (!cut || hop.t >= 1)) return;
      const changed = next !== place;
      place = next;
      if (changed) {
        const was = perched;
        perched = next ? perchPlacement(spec, next, options.key) : null;
        hop.from.copy(body.position);
        hop.turnFrom = body.rotation.y;
        hop.to.set(...(perched?.feet ?? [0, 0, 0]));
        hop.turnTo = perched?.turn ?? 0;
        hop.seconds = Math.max(HOP_MIN, hop.from.distanceTo(hop.to) * HOP_PACE);
        hop.t = hop.from.distanceToSquared(hop.to) < 1e-8 && hop.turnFrom === hop.turnTo ? 1 : 0;
        const stands = perched?.step ? stepOf(perched.step.spec) : null;
        if (stands !== step) {
          if (leaving) leaving.visible = false;
          leaving = step;
          step = stands;
        }
        if (step && perched?.step) {
          step.visible = true;
          step.position.set(perched.step.x, 0, perched.step.z);
        }
        if ((was?.perch.pose ?? null) !== (perched?.perch.pose ?? null)) pose();
      }
      if (cut) hop.t = 1;
      if (hop.t >= 1) settle(1);
    },
    setState(next) {
      if (sameState(next, state)) return;
      state = { activity: next.activity, waiting: next.waiting, alert: next.alert, proxy: next.proxy, carrying: next.carrying };
      pose();
      skin();
      extension?.setState?.(state);
    },
    setDetail(next) {
      if (next === detail) return;
      detail = next;
      skin();
    },
    setHighlight(next) {
      if (next === highlight) return;
      // A figure without a look for it stays as it is: the renderer's ring is the affordance.
      const lifted = (highlight !== "none" && looks[highlight]) || (next !== "none" && looks[next]);
      highlight = next;
      if (lifted) skin();
    },
    update(seconds) {
      if (hop.t < 1) settle((hop.t = Math.min(1, hop.t + seconds / hop.seconds)));
      // An echo and a stale figure stand still.
      if (state.proxy || state.activity === "stale") return;
      time += seconds;
      if (haloOn) halo.update(seconds);
      for (let i = 0; i < moving.length; i++) moving[i]!.now.set(moving[i]!.base);
      const g = glance;
      const rest = g ? 1 - wave("glance", (time + g.offset) / g.period + g.phase, g.period) : 1;
      for (let i = 0; i < waves.length; i++) {
        const w = waves[i]!;
        w.joint.now[w.channel]! += w.amplitude * wave(w.kind, (time + w.offset) / w.period + w.phase, w.period) * (w.rests ? rest : 1);
      }
      for (let i = 0; i < moving.length; i++) writeJoint(moving[i]!, moving[i]!.now, moving[i]!.moves);
      extension?.update?.(seconds);
    },
    dispose() {
      for (const m of owned.values()) m.dispose();
      owned.clear();
      extension?.dispose?.();
      halo.dispose();
      root.removeFromParent();
    },
  };
}

/** A cast from its data: every figure is built by the runtime with the style's kit, then handed to `extend`. */
export function createCast(manifest: CastManifest, spec: FigureSpec, kit: FigureKit, extend?: FigureExtension): Cast {
  return {
    manifest,
    figure: (options) => figure(spec, kit, options, extend),
    dispose() {},
  };
}
