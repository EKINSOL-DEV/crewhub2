/**
 * The cast seam: the figures that stand for agents (and the postman and the town-hall agent), swappable apart from the
 * world style (spec addendum "casts"). A cast is data first: a manifest (`cast.json`, format `crewhub-cast/1`) and a
 * figure (`figure.json`, format `crewhub-figure/1`): joints, parts on those joints, a still pose and a small motion per
 * activity, looks per state, colourways and anchors. The generic runtime of this package turns that data into figures;
 * a cast needs code only where a shape or a motion cannot be said in data.
 *
 * Figures draw through a `FigureKit` that the world style provides, so every cast takes the style's geometry, materials,
 * glow, evening and cloud shadows, and stays batchable by the renderer's robot crowd. Renderers only ever talk to
 * `FigureHandle`s from a `Cast` resolved by the cast registry; nothing outside a cast package imports from inside it.
 *
 * The cast reads what the renderer already knows from the `WorldModel` (`AgentPlacement`, walks, the postman's letters);
 * the reducer, the projection and the demo source know nothing of casts.
 */
import type * as THREE from "three";
import type { PropShape, Vec3 } from "@crewhub/world-engine";
import type { PaletteName, StyleTheme } from "@crewhub/world-style";

/* ── What a figure stands for ───────────────────────────────────────────── */

/**
 * The roles a cast draws. `operator` is the town-hall agent, `postman` the post office's walker. `unknown` is an agent
 * whose role is not known yet (a new agent): a cast may draw it plainer than a worker (an empty pot with a seed).
 */
export const CAST_ROLES = ["lead", "worker", "design", "analyst", "postman", "operator", "unknown"] as const;
export type CastRole = (typeof CAST_ROLES)[number];

/**
 * What the figure is doing, derived by the renderer from the agent's debounced posture and lane status:
 * focused → working; relaxed with lane "done" → done; relaxed otherwise → idle; raised-hand → blocked;
 * greyed (lane unknown, a stale snapshot) → stale. `walking` is any figure moving between places; it wins over the rest.
 */
export const FIGURE_ACTIVITIES = ["working", "idle", "done", "blocked", "stale", "walking"] as const;
export type FigureActivity = (typeof FIGURE_ACTIVITIES)[number];

/** The full state a figure shows. Every combination must read; a cast decides how. */
export interface FigureState {
  activity: FigureActivity;
  /** A ticket on its desk waits on a person: the figure asks (a raised hand, a glowing flower). */
  waiting: boolean;
  /** Its building has a stall or needs attention: the style's alert halo shows under it (the cast may add its own). */
  alert: boolean;
  /** The translucent echo of an agent that works in another building: still, see-through, no shadow. */
  proxy: boolean;
  /** Something in hand (the postman's letters, a carried ticket); false is "carrying nothing". */
  carrying: boolean;
}

export const IDLE_STATE: FigureState = { activity: "idle", waiting: false, alert: false, proxy: false, carrying: false };

/** "far": seen from the town, a few pixels tall; small parts and shadows may go, the silhouette and colours stay. */
export type FigureDetail = "near" | "far";
/** The soft 3D affordances: the renderer draws the selection ring; the figure may lift its colours a little. */
export type FigureHighlight = "none" | "hover" | "selected";

/**
 * Points the world needs, in the figure's own space at scale 1, standing, facing +z, feet on y = 0. The renderer
 * scales figures (0.62 inside buildings), so anchors scale with them.
 */
export interface FigureAnchors {
  /** Just above the head: the name pill and the bubbles hang here. */
  label: Vec3;
  /** Where a carried thing rides (the postman's letters, a ticket). */
  carry: Vec3;
  /** The radius of the ground contact: the blob shadow, the selection ring and the alert halo size to it. */
  ground: number;
  /** Total height, standing: framing, hit areas and the far crowd's culling use it. */
  height: number;
}

/* ── The runtime contract renderers use ─────────────────────────────────── */

export interface FigureHandle {
  readonly object: THREE.Object3D;
  readonly anchors: FigureAnchors;
  /** Cheap to call every frame with the same state: a figure only re-poses and re-skins on a change. */
  setState(state: FigureState): void;
  setDetail(detail: FigureDetail): void;
  setHighlight(highlight: FigureHighlight): void;
  /**
   * The idle, work and walk motion; `seconds` since the last call. The renderer never calls it under reduced motion: the
   * figure then shows its still pose for the activity, which must read on its own.
   */
  update(seconds: number): void;
  dispose(): void;
}

export interface FigureOptions {
  /** The agent key: seeds colourways and rhythms, so a figure looks and moves the same on every load. */
  key: string;
  role: CastRole;
  /** The project colour (a lead's accent, a glazed band, a flower); null outside a project. */
  accent: PaletteName | null;
}

export interface Cast {
  readonly manifest: CastManifest;
  figure(options: FigureOptions): FigureHandle;
  dispose(): void;
}

/** What a cast package exports (its `index.ts` default and named export `cast`). */
export interface CastFactory {
  readonly manifest: CastManifest;
  /** The cast's figure data (a `FigurePatch` when the manifest `extends` another cast); absent for a code-only cast. */
  readonly figure?: FigureSpec | FigurePatch;
  /** Code for what data cannot say (optional). With `figure`, the runtime builds the figure and then calls this. */
  readonly extend?: FigureExtension;
  /** A cast drawn wholly in code (no `figure`): build it with the style's kit. */
  readonly create?: (kit: FigureKit) => Cast;
}

/**
 * A code hook for data figures: it gets the built figure's joints and may add shapes or motion. It runs once per
 * figure; the returned `update` (optional) runs after the data motion each frame.
 */
export type FigureExtension = (figure: {
  options: FigureOptions;
  kit: FigureKit;
  joints: ReadonlyMap<string, THREE.Object3D>;
  state: () => FigureState;
  detail: () => FigureDetail;
}) => { update?(seconds: number): void; setState?(state: FigureState): void; dispose?(): void } | void;

/* ── What the style gives a cast ────────────────────────────────────────── */

/**
 * The style's drawing kit for figures. Colours are a cast colour name (from the cast manifest's `colors`), a style
 * palette name, or `soft:<name>` (that colour half-way to the style's cream: a lead's gentle project tint). Materials
 * are shared and follow the theme, the day-night drift's glow and the cloud shadows, like the style's own.
 */
export interface FigureKit {
  readonly theme: StyleTheme;
  /** A mesh for one part, geometry and material shared; the part's own position and rotation applied. */
  part(part: FigurePart, color: string): THREE.Mesh;
  /** A shared material; `glow` makes it emissive (a number is the strength in its own colour, a name a glow colour). */
  material(color: string, options?: { glow?: number | string }): THREE.MeshStandardMaterial;
  /** The colour string of a colour name in the current theme. */
  hex(color: string): string;
  /** The soft blob under a figure in every quality setting. */
  contactShadow(radius: number): THREE.Mesh;
  /** The style's alert halo on the ground: shown while `active`, in an alert colour or the figure's own. */
  halo(radius: number): FigureHalo;
}

export interface FigureHalo {
  readonly object: THREE.Object3D;
  set(active: boolean, color: string): void;
  update(seconds: number): void;
  dispose(): void;
}

/* ── The data: cast.json (crewhub-cast/1) ───────────────────────────────── */

export interface CastManifest {
  format: "crewhub-cast/1";
  /** Lowercase, `a-z0-9-`, unique: "classic-bots". The package is `cast-<id>`. */
  id: string;
  name: string;
  /** Semver. */
  version: string;
  /** One or two sentences, shown in Settings and the casting room. */
  description: string;
  author?: string;
  /**
   * Another cast this one re-dresses: its figure is the base, and this cast's `figure.json` (format
   * `crewhub-figure-patch/1`) recolours, adds and removes parts. The registry resolves it; nothing is imported.
   */
  extends?: string;
  /** The cast's own colours per theme, CSS colour strings (hex lives only in cast data, never in code). */
  colors: Record<string, { day: string; lamplight: string }>;
  /** Per-figure budgets the contract test holds every role to (the renderer's crowd batches far figures). */
  budget: { nearTriangles: number; farTriangles: number; nearMeshes: number; farMeshes: number };
}

/* ── The data: figure.json (crewhub-figure/1) ───────────────────────────── */

/** A shape as in crewhub-prop/1 (same sizes and units), placed relative to its joint. */
export interface FigurePart {
  shape: PropShape;
  size: Vec3;
  position: Vec3;
  /** Degrees, XYZ order. */
  rotation?: Vec3;
  /** Rounded box corner radius, box only. */
  radius?: number;
  /** Wedge only: degrees. */
  sweep?: number;
}

export interface FigurePartSpec extends FigurePart {
  /** Unique within the figure, so looks, patches and code can name it: "visor", "leaf-left". */
  id?: string;
  /** The joint it rides; "root" (the figure's feet) when left out. */
  joint?: string;
  /**
   * A cast or style colour name, `slot:<name>` (a colourway slot, see `colorways`), or `accent` (the project colour;
   * the slot's fallback when there is none).
   */
  color: string;
  /** Emissive strength (lamps, eyes); the theme's glow scales it. */
  glow?: number;
  /** Only for these roles. */
  roles?: CastRole[];
  /** Only in these activities (a bud at rest, an open flower at work). */
  activities?: FigureActivity[];
  /** Only while waiting on a person, or only while not. */
  waiting?: boolean;
  /** Only while carrying, or only while not. */
  carrying?: boolean;
  /** "near": dropped seen from the town, with its shadow. */
  detail?: "near";
}

export interface FigureJoint {
  id: string;
  /** The parent joint; "root" when left out. */
  parent?: string;
  /** Rest position relative to the parent. */
  position: Vec3;
}

/** A joint's pose: rotations in degrees, offsets in world units added to the rest position, a scale (1 is rest). */
export interface JointPose {
  rotation?: Vec3;
  offset?: Vec3;
  scale?: Vec3;
}

/** The animatable channels of a joint. */
export type MotionChannel = "rotation.x" | "rotation.y" | "rotation.z" | "offset.x" | "offset.y" | "offset.z" | "scale.x" | "scale.y" | "scale.z";

/**
 * A wave over time, `period` seconds long, added to the pose (degrees for rotations, units for offsets, a factor
 * difference for scales). sine: smooth back and forth. bounce: |sine|, a hop. lift: max(0, sine), a foot or a step.
 * blink: a short dip once per period (eyes). glance: a soft swell, about 1.6 s, once per period (a look round).
 */
export type MotionWave = "sine" | "bounce" | "lift" | "blink" | "glance";

export interface Motion {
  joint: string;
  channel: MotionChannel;
  wave: MotionWave;
  amplitude: number;
  period: number;
  /** A phase offset in periods (0..1); `seeded` adds a per-figure offset from the agent key, so figures never move in step. */
  phase?: number;
  seeded?: boolean;
  /** With `glance`: the turn's side is seeded per figure (left or right). */
  sided?: boolean;
}

/** Looks per state: parts that glow or swap colour while a state holds. */
export interface FigureLook {
  /** Part ids → a colour (a cast or style colour name) and/or a glow strength while this look holds. */
  parts: Record<string, { color?: string; glow?: number }>;
}

export interface FigureSpec {
  format: "crewhub-figure/1";
  joints: FigureJoint[];
  parts: FigurePartSpec[];
  /** The still pose per activity; `waiting` and `carrying` layer on top of it. Joints left out rest. */
  poses: Partial<Record<FigureActivity | "waiting" | "carrying", Record<string, JointPose>>>;
  /** The motion per activity (and `waiting`, layered); left out or empty: still. Never run under reduced motion. */
  motions: Partial<Record<FigureActivity | "waiting", Motion[]>>;
  /** Looks per activity and per `waiting` / `alert`, layered in that order. */
  looks?: Partial<Record<FigureActivity | "waiting" | "alert", FigureLook>>;
  /**
   * Colourway slots: `slot:<name>` parts take the lead's colour for a lead (`soft:accent` for the soft project tint,
   * `accent` for the project colour itself, or a colour name), else one of `others`, seeded by the agent key.
   */
  colorways: Record<string, { lead?: string; roles?: Partial<Record<CastRole, string>>; others: string[] }>;
  anchors: FigureAnchors;
}

/**
 * A re-dress of another cast's figure (`extends` in the manifest): recolour colours or parts, drop parts, add parts,
 * and change looks or anchors. Joints, poses and motions stay the base's (the rig is reused), unless overridden.
 */
export interface FigurePatch {
  format: "crewhub-figure-patch/1";
  /** Base colour names (and slot colours) → this cast's colour names. */
  recolor?: Record<string, string>;
  /** Base part ids to drop. */
  remove?: string[];
  add?: FigurePartSpec[];
  looks?: FigureSpec["looks"];
  colorways?: FigureSpec["colorways"];
  motions?: FigureSpec["motions"];
  anchors?: Partial<FigureAnchors>;
}
