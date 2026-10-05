/**
 * The world style seam: the contract every look of CrewHub World implements (spec addendum "Greenhouse is one style
 * of several"). Types and the one pure resolver of style options: no drawing and no colours. Renderers ask a `WorldStyle` for semantic models by key
 * and for palette colours by name; the style decides the look. Styles resolve per building (a plot's style id, else
 * the town default), never through a global singleton.
 */
import type * as THREE from "three";
import type { PropMaterial, PropModel, Vec3 } from "@crewhub/world-engine";
import type { CastManifest, FigureKit } from "@crewhub/world-cast";

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
  /** Building shell pieces (art pass): slab, partitions, door frames, the loading door and apron, ivy, signs. */
  | `building.${string}`
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
  | "focus-ring"
  /** Soft affordances: a glowing outline round a focused or hovered plot (`size`), a soft wash on a hovered or focused
      room's floor (`size`), a soft ring under the selected agent's feet. Flat, at their origin, never blocking. */
  | "focus-glow"
  | "focus-fill"
  | "selection-ring"
  /** Town dressing (art pass): trees, hedges, flower beds, lanterns, benches, signposts, bike racks, ponds, bridges. */
  | `town.${string}`
  /** Civic pieces (art pass): the post office, the town hall, the square, the café, the bus stop. */
  | `civic.${string}`
  /** Room dressing that never blocks movement (art pass): rugs, wall art, clocks, pendant lamps, windows, mood walls. */
  | `decor.${string}`;

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
  /** Words a style may paint on a piece, such as a building's name on its sign. Plain text, short. */
  text?: string;
}

/**
 * The viewer's graphics setting (Settings, kept per browser). "pretty" (the default) draws soft shadow maps and the
 * ambient effects (warm light pools, glow); "fast" turns them off. Blob contact shadows stay in both.
 */
export type GraphicsQuality = "pretty" | "fast";

export interface EnvironmentHandle {
  setTheme(theme: StyleTheme): void;
  /**
   * Fits the key light's shadow to a square of this half-size around `center` (the origin when left out). A small
   * reach (an entered building, a room) gets crisp, close shadows; a large one (the town) cheaper, softer ones.
   */
  setShadowReach(reach: number, center?: { x: number; z: number }): void;
  /** Shadow maps and the ambient effects follow the graphics setting; the renderer's own settings are the caller's. */
  setQuality(quality: GraphicsQuality): void;
  /**
   * The day-night drift. `phase` is the time of day as a fraction of one day: 0 is the morning, the light runs through
   * the afternoon into dusk and the evening and comes back through dawn at 1. The renderer derives it from the
   * source's clock; null keeps the theme's fixed look (reduced motion, Fast, the setting off). The theme stays the base
   * and the drift shades it. Cheap to call a few times a second: true when the light changed (the caller redraws).
   */
  setDayPhase(phase: number | null): boolean;
  /** How far into the evening the light is: 0 by day, 1 when every lantern, lit window and firefly shows. */
  readonly evening: number;
  /**
   * The air behind the diorama now: a colour and how much of it (0 to 1) to mix into the theme's own air. The renderer
   * tints the scene's backdrop with it; the HTML chrome keeps the theme's colours.
   */
  readonly air: { readonly color: THREE.Color; readonly tint: number };
  /**
   * Counts the moves of the key light and its shadow frustum. A renderer that redraws shadow maps only when needed
   * redraws them when this changes.
   */
  readonly shadowVersion: number;
  /**
   * Soft cloud shadows that dim the key light on everything they pass over (ground, roofs, walls, people), 5 numbers
   * per cloud: centre x and z, half-length and half-width in world units, and its turn about y. An empty array clears
   * them. Optional: a style without it draws `town.cloud-shadow` on the ground instead.
   */
  setCloudShadows?(clouds: ArrayLike<number>): void;
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
  /** Opacity of the blob contact shadows under buildings and robots. */
  shadowOpacity: number;
  /** Emissive strength of lamps, screens and lit windows in this theme (1 is the model's own). */
  glow: number;
  /** Opacity of the warm light pools under lamps (0 hides them: daylight). */
  pools: number;
  /** How far into the evening this light is: 0 by day, 1 when every lantern and lit window shows (`evening`). */
  evening: number;
  /** The air behind the diorama at this light: `air` mixed into the theme's own air by `airTint` (0 keeps it as is). */
  air: string;
  airTint: number;
}

/**
 * The extra lights of the day-night drift. A style that gives them drifts; one without them keeps its theme's look.
 * By day the drift runs through dawn and dusk; in lamplight it deepens into the night and back.
 */
export type DriftLight = "dawn" | "dusk" | "night";

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
  /** The cast whose figures stand for agents in this style, unless the viewer or the town chose another. */
  defaultCast?: string;
  /**
   * The tops figures work at, by the model's key. A cast's figure may be too small to see over one and bring a perch
   * (`@crewhub/world-cast`): furniture never changes with the cast, the style only says where each top is. A key left
   * out: the renderer takes the model's bounding box as a plain table.
   */
  workSurfaces?: Partial<Record<ModelKey, WorkSurface>>;
  /**
   * The choices this style offers within its own look (a season, what is planted, an accent, the lanterns), as data.
   * A zone, a building, the viewer or the town picks a value per option (`StyleOptionValues`); `resolveStyleOptions`
   * turns those picks into one value for every option. A style without options has one look.
   */
  options?: StyleOption[];
  palette: Record<PaletteName, string>;
  lighting: Record<StyleTheme, LightingPreset> & Partial<Record<DriftLight, LightingPreset>>;
}

/** One choice a style offers. Ids are the style's own; names are what a person reads in Settings. */
export interface StyleOption {
  id: string;
  name: string;
  description?: string;
  values: StyleOptionValue[];
  /** The id of the value the style shows when nobody chose. */
  default: string;
}

export interface StyleOptionValue {
  id: string;
  name: string;
  description?: string;
}

/**
 * Picked values by option id. It is written for one style and may be read by another (a zone keeps its picks when the
 * town changes style), so a style ignores every option id and every value id it does not know.
 */
export type StyleOptionValues = Readonly<Record<string, string>>;

/**
 * One value for every option the style declares, from layers of picks, the most specific first (a building, its zone,
 * the viewer, the town): the first layer that names a value the option has wins, else the option's default. Option ids
 * and value ids the style does not know are dropped, so the result is safe to hand to `withOptions`.
 */
export function resolveStyleOptions(manifest: Pick<StyleManifest, "options">, ...layers: (StyleOptionValues | null | undefined)[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const option of manifest.options ?? []) {
    const known = new Set(option.values.map((v) => v.id));
    out[option.id] = layers.map((layer) => layer?.[option.id]).find((value): value is string => typeof value === "string" && known.has(value)) ?? option.default;
  }
  return out;
}

/** A stable key for resolved option values: the same picks give the same key, whatever order they were written in. */
export function styleOptionsKey(values: StyleOptionValues): string {
  return Object.keys(values)
    .sort()
    .map((id) => `${id}=${values[id]}`)
    .join(";");
}

/**
 * A top a figure works at, in its model's own space as `model(key)` returns it: the origin is the footprint's centre
 * on the floor, world units.
 */
export interface WorkSurface {
  /** The top's height above the floor. */
  height: number;
  /** Half the top's width (x) and depth (z). */
  half: [number, number];
  /** The middle of a screen standing on it; it faces +z, where its worker is. Left out: a table, looked at in its middle. */
  screen?: Vec3;
  /**
   * Free places on the top for something to sit, best first: clear of the model's own things for `radius` around.
   * Left out: the top is clear, anywhere along its edge will do.
   */
  spots?: { x: number; z: number; radius: number }[];
}

export interface WorldStyle {
  readonly manifest: StyleManifest;
  /**
   * A new object for a semantic key; geometry and materials are shared inside the style. Null for a key the style
   * does not cover (the registry then draws the neutral placeholder).
   */
  model(key: ModelKey, options?: ModelOptions): THREE.Object3D | null;
  /**
   * The kit a cast draws its figures with (`@crewhub/world-cast`): the style's shapes, shared materials, contact
   * shadow and alert halo, with the cast's own colours per theme. One per cast. A style without one gets the cast
   * registry's plain reference kit.
   */
  figureKit?(cast: Pick<CastManifest, "id" | "colors">): FigureKit;
  /**
   * The same style dressed in option values (`StyleManifest.options`): what it returns for `model`, `parts` and `color`
   * is that look's. Theme, light, quality and `dispose` stay the style's own, so every look of a style follows the one
   * environment. Pieces the values do not change share their geometry and materials with every other look, so a
   * district in another look costs draw calls only for what differs. Unknown ids and values are ignored. A style
   * without options leaves it out.
   */
  withOptions?(values: StyleOptionValues): WorldStyle;
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
export interface ResolvedStyle extends Omit<WorldStyle, "model" | "withOptions"> {
  model(key: ModelKey, options?: ModelOptions): THREE.Object3D;
  /** The option values this style is dressed in: one for every option its manifest declares. */
  readonly options: StyleOptionValues;
  /** The style in other option values (resolved against its manifest first); one instance per set of values. */
  withOptions(values: StyleOptionValues | null | undefined): ResolvedStyle;
}

/**
 * Convention for animated models: a model may set `object.userData.animate = (seconds) => void` (the drone's rotor,
 * a beacon's slow turn). Renderers call it each drawn frame while the model is shown, and skip it under reduced motion.
 */
export type ModelAnimation = (seconds: number) => void;

/**
 * Convention for ambient life: a model may hold empty child objects with `userData.life` set to a `LifeSpot` kind,
 * marking where steam rises (a chimney, a cup) or where a lit window glows (facing the marker's +z). The renderer's
 * ambient life places the `town.steam` and `town.window-glow` models there; a style without spots simply has none.
 */
export type LifeSpot = "steam" | "window";
