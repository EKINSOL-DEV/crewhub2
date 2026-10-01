/**
 * The world style seam: the contract every look of CrewHub World implements (spec addendum "Greenhouse is one style
 * of several"). Types only: no implementation and no colours. Renderers ask a `WorldStyle` for semantic models by key
 * and for palette colours by name; the style decides the look. Styles resolve per building (a plot's style id, else
 * the town default), never through a global singleton.
 */
import type * as THREE from "three";
import type { PropMaterial, PropModel } from "@crewhub/world-engine";

/** Light UI → day, dark UI → lamplight (warmer, dimmer, lit windows and desk lamps). */
export type StyleTheme = "day" | "lamplight";

/** Palette names a style must resolve: the prop materials, which include the loops project colours. */
export type PaletteName = PropMaterial;

export type EmblemName = "home" | "inbox" | "bot" | "spark" | "users" | "star" | "folder";
export type TicketLook = "task" | "feature" | "bug" | "question";

/** Semantic model keys. Renderers ask by key; the style decides the look. */
export type ModelKey =
  | "ground"
  | "plot"
  | "path"
  | "street-lamp"
  | "planting"
  | "wall"
  | "wall.glass"
  | "wall.low"
  | "door"
  | "floor"
  | "room.sign"
  | "building.flag"
  | "building.planks"
  | `emblem.${EmblemName}`
  | "post-office"
  | "town-hall"
  | "mailbox"
  | "letter"
  | "letter.flagged"
  /** Builtin prop definition ids: desk, plant, bench, lamp, sofa, table, shelf, workdesk, lead-desk, rack, … */
  | `furniture.${string}`
  | `ticket.${TicketLook}`
  | "ticket.tag"
  | "ticket.strap"
  | "ticket.seal"
  | "ticket.band"
  | "ticket.sticker"
  | "ticket.nametag"
  | "ticket.speech"
  | "pallet"
  | "drone"
  | "cart"
  | "truck"
  | "beacon"
  | "trophy"
  | "banner"
  /** Rule props (plan 6.3): the release crate in Dispatch, the bug jar on the lead's desk, a rocket on a ticket. */
  | "crate"
  | "jar"
  | "sticker.rocket"
  | "desk-lamp"
  | "quiet-clock"
  | "error-crate"
  | "sparkle"
  | "focus-ring";

export interface ModelOptions {
  /** Size in world units for stretchable pieces (walls, floors, pallets, straps). */
  size?: { width: number; height: number; depth: number };
  /** An accent from the palette, e.g. a project colour for trims and flags. */
  accent?: PaletteName | null;
  /** Deterministic variety (plant shape, book colours). */
  seed?: number;
  /**
   * A short variant name the style understands: "archived" (boarded-up walls, a flag at half-mast), "dim" (an empty
   * room's floor, a stalled desk's lamp), "urgent" or "high" (priority tags), "star" (the prop sticker).
   */
  variant?: string;
}

export type RobotPosture = "focused" | "relaxed" | "raised-hand" | "greyed" | "walking";
export type RobotRole = "lead" | "worker" | "analyst" | "design" | "router";

export interface RobotHandle {
  readonly object: THREE.Object3D;
  setPosture(posture: RobotPosture): void;
  /** The translucent echo of an agent that works in another building; still. */
  setProxy(proxy: boolean): void;
  /** A lit halo: the agent's own building has a stall or a waiting ticket. */
  setAlert(alert: boolean): void;
  /** Idle bob, typing, walking; `seconds` since the last call. Callers skip it under reduced motion. */
  update(seconds: number): void;
  /**
   * "far": the robot is seen from the town, a few pixels tall. The style may drop small parts and shadows to save
   * triangles; the silhouette, colours and postures stay. "near" (the default) is the full robot.
   */
  setDetail(detail: RobotDetail): void;
  dispose(): void;
}
export type RobotDetail = "near" | "far";

export interface EnvironmentHandle {
  setTheme(theme: StyleTheme): void;
  /** Fits the key light's shadow to a square of this half-size around the origin. */
  setShadowReach(reach: number): void;
  dispose(): void;
}

/** Light rig of one theme, as data. Colours are CSS colour strings in the style's own manifest, never in renderers. */
export interface LightingPreset {
  /** The sky colour behind the scene, or null for a transparent canvas (the UI background shows through). */
  background: string | null;
  sky: string;
  ground: string;
  hemisphere: number;
  key: string;
  keyIntensity: number;
  keyPosition: [number, number, number];
  fill: string;
  fillIntensity: number;
  fillPosition: [number, number, number];
  exposure: number;
  /** Opacity of the soft contact shadow under the town. */
  shadowOpacity: number;
}

/**
 * What a style declares about itself; for Greenhouse this is `packages/style-greenhouse/style.json`. A future plugin
 * ships the same manifest. `coveredKeys` lists the semantic keys the style provides; any other key falls back to the
 * registry's neutral placeholder with a warning.
 */
export interface StyleManifest {
  id: string;
  name: string;
  /** Semver. */
  version: string;
  description: string;
  coveredKeys: ModelKey[];
  palette: Record<PaletteName, string>;
  lighting: Record<StyleTheme, LightingPreset>;
}

export interface WorldStyle {
  readonly manifest: StyleManifest;
  /**
   * A new object for a semantic key; geometry and materials are shared inside the style. Null for a key the style
   * does not cover (the registry then draws the neutral placeholder).
   */
  model(key: ModelKey, options?: ModelOptions): THREE.Object3D | null;
  robot(options: { key: string; accent: PaletteName | null; role: RobotRole }): RobotHandle;
  /** A crewhub-prop/1 prop; its part materials are palette names this style resolves. */
  parts(prop: PropModel): THREE.Object3D;
  color(name: PaletteName, theme: StyleTheme): THREE.Color;
  /** Theme-dependent looks of the style's shared materials: lit windows, desk lamps, a darker ground. */
  setTheme(theme: StyleTheme): void;
  /** Lights, tone mapping and background for a theme. */
  environment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, theme: StyleTheme): EnvironmentHandle;
  /** The materialise effect (props, the drone): 0 is gone, 1 is fully there. The same call de-materialises. */
  materialise(object: THREE.Object3D, progress: number): void;
  dispose(): void;
}

export interface WorldStyleFactory {
  manifest: StyleManifest;
  create(): WorldStyle;
}

/**
 * A style as the registry hands it to renderers: every key resolves. A key the style does not cover draws the
 * registry's neutral placeholder (a plain mist crate) and warns once.
 */
export interface ResolvedStyle extends Omit<WorldStyle, "model"> {
  model(key: ModelKey, options?: ModelOptions): THREE.Object3D;
}

/**
 * Convention for animated models: a model may set `object.userData.animate = (seconds) => void` (the drone's rotor,
 * a beacon's slow turn). Renderers call it each drawn frame while the model is shown, and skip it under reduced motion.
 */
export type ModelAnimation = (seconds: number) => void;
