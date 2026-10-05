/* The town: one plot per building in `model.buildings` order, a post office and a town hall. The town-level pieces
   (ground, lawns, lamps, civic buildings, lights) use the town default style; each building is drawn by a
   `BuildingView` with the style its plot resolves to. It reads the WorldModel contract only. Labels are HTML
   (WorldCanvas); this class positions every `[data-anchor]` element over its anchor each drawn frame. It renders on
   demand: a frame is drawn after a change, a camera move, during a tween, or while something inside the entered
   building moves, or while someone walks.

   Walks: `walks.ts` owns the navigation world and the simulation. It gets every new model and view, ticks once per
   drawn frame at the playback speed (paused with it, and with the tab), and each robot follows its walker. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { zoneById } from "@crewhub/world-model";
import type { AgentPlacement, RoomKind, WorldModel } from "@crewhub/world-model";
import { IDLE_STATE, type Cast, type FigureHandle, type FigureState } from "@crewhub/world-cast";
import { styleOptionsKey, type EnvironmentHandle, type GraphicsQuality, type ModelAnimation, type ModelKey, type ResolvedStyle, type StyleOptionValues, type StyleTheme } from "@crewhub/world-style";
import { BuildingView, type Pick } from "./buildingView";
import { BACK_WALL_HEIGHT, BUILDING_CELL, FLOOR_RISE } from "./buildingTemplate";
import type { TownLayer } from "./propLayer";
import { styleRegistry } from "./style";
import type { StyledPlot } from "./styleRegistry";
import { lookAt, looksSignature, previewLooks, type TownLooks } from "./townLooks";
import type { Ambient } from "./movement";
import { CIVIC_LOT, civicCenter, PLOT_SIZE, TOWN_CAPACITY, TOWN_COLUMNS, townBounds, type Bounds } from "./townLayout";
import { lotKey } from "./settlement";
import { homeRects, planKey, type TownPlan } from "./townPlan";
import { Construction } from "./construction";
import { GRASS_Y, landmarks as townLandmarks, LAWN_Y, slugSeed, townDressing } from "./townDressing";
import { InstanceCuller, instanceStatic } from "./instanceStatic";
import { mergeStatic } from "./mergeStatic";
import { plotDoor, plotObstacles } from "./navigation";
import { onPlayIntent } from "./intentPlayer";
import { Walks } from "./walks";
import { AmbientLife } from "./ambientLife";
import { driftPhase, followPhase, type DriftFollow } from "./dayClock";
import { FrameRing } from "./frameRing";
import { nudgeStacks, overRobot, type Label, type RobotBox } from "./labelLayout";
import { updateMatrices } from "./matrixPass";
import { RobotCrowd } from "./robotCrowd";
import { DistrictFrames, type DistrictView } from "./districtFrames";
import { labelDetail, type LabelDetail } from "./wayfinding";
import { castRegistry } from "./cast";
import { buildingLook, townLook, type LookContext } from "./worldLook";
import { figureRole, figureState, type FigureFacts, type FigurePlace } from "./figureState";

export interface TownView {
  model: WorldModel;
  /** Slug of the building whose interior is shown, or null for the town overview. */
  entered: string | null;
  /** Where every building stands and how large the settlement is (townPlan.ts). */
  plan: TownPlan;
  /** Index (in `model.buildings`) of the building with the keyboard focus ring. */
  focused: number;
  ringVisible: boolean;
  /** Inside a building: the room with the keyboard focus ring, and the room the camera frames. */
  room: RoomKind | null;
  zoomed: RoomKind | null;
  reducedMotion: boolean;
  /** The resolved UI theme: light is day, dark is lamplight. */
  theme: StyleTheme;
  /** The viewer's graphics setting: "pretty" draws shadow maps and ambient effects, "fast" leaves them out. */
  quality: GraphicsQuality;
  /** The viewer's cast (Settings); null follows the town and the style. A building's own cast and its zone's win over it. */
  cast: string | null;
  /** The viewer's style options (Settings); an absent one follows the town. A zone's and a building's own win over them. */
  styleOptions?: Readonly<Record<string, string>>;
  /** Source time now (ms): drone flights run on it, so they follow the playback speed. */
  now: () => number;
  /** The Day and night setting: the light drifts with the source clock (`dayClock`). */
  dayNight: boolean;
  /** Source time since the first loop's start (ms): the day-night drift's clock. */
  dayClock: () => number;
  /** The town document and build mode's ghost and selection (applied to the entered building only). */
  town: TownLayer | null;
  /** Playback speed (0 is paused): walks run at it, capped by the engine's tick. */
  speed: () => number;
  /** Idle variety: off, reduced or on (Settings). */
  ambient: Ambient;
  /** The dev stress fixture: draw every frame, uncapped, and keep frame statistics. */
  measure: boolean;
  /** The frame rate overlay is on: keep frame statistics (`perf()`). */
  fps?: boolean;
  /** Inside a building: the selected agent's key (a soft ring under its feet), or null. */
  selectedAgent?: string | null;
  /** The districts in use and the one the view is in (a region's level between home and a building), or null. */
  districts?: readonly DistrictView[];
  district?: string | null;
  /**
   * The look of the town and of each district (townLooks.ts): picks for the style's options. Left out, the address
   * bar's preview (`?look=`, `?looks=`), else the style as it stands.
   */
  looks?: TownLooks | null;
}
export type BuildPointer = "move" | "click" | "drag" | "drop";

/** Frame statistics over the last `FRAME_WINDOW` drawn frames (the stress overlay). */
export interface FrameStats {
  frames: number;
  /** Time between drawn frames, ms. */
  mean: number;
  p95: number;
  max: number;
  /** CPU work per frame (walks, buildings, render submission), ms. */
  workMean: number;
  workP95: number;
  /** The walk engine's tick, ms. */
  tickMean: number;
  tickMax: number;
  calls: number;
  walkers: number;
}
const FRAME_WINDOW = 300;
/** The town's shadow map follows small changes (piles, the drifting sun) at most this often (ms). */
const SOFT_SHADOW_MS = 400;
/** How often the day-night drift looks at the clock: the light changes at most four times a second. */
const DRIFT_INTERVAL_MS = 250;
/* The frame loop draws at most 60 times a second, so a 120 Hz display does not double the work (the stress fixture is
   uncapped). A display frame is skipped only when less than three quarters of a 60 Hz frame has passed since the last
   drawn one: at 120 Hz (8.3 ms, +-1.5 ms of jitter) every other one is drawn, at 60 Hz every one. A tighter test (or a
   fixed 60 Hz grid, whose phase drifts against the display's) skips a frame that came a hair early and draws the next
   one 25 ms late. */
const FRAME_SKIP_MS = (1000 / 60) * 0.75;
/** The numbers the frame rate overlay shows and `window.__worldPerf` exposes (ms, counts and bytes). */
export interface WorldPerf {
  fps: number;
  /** No frame drawn for a moment: the loop rests until something changes. */
  idle: boolean;
  frameMean: number;
  frameP95: number;
  frameMax: number;
  /** Frames more than 33 ms after the one before, in the window. */
  slow: number;
  workMean: number;
  workP95: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** The JS heap in bytes, where the browser tells (Chromium), else null. */
  heap: number | null;
  quality: GraphicsQuality;
  /** The name of the cast in view: the entered building's, else the town's. */
  cast: string;
  /** "town", or the entered building's slug. */
  view: string;
  /** Drawn frames in the window. */
  frames: number;
  /** performance.now() of this sample. */
  at: number;
}
/* The overlay's window: frame time and work over the last two seconds. */
const PERF_WINDOW_MS = 2000;
export type CameraAction = "home" | "rotate-left" | "rotate-right" | "zoom-in" | "zoom-out";
interface Callbacks {
  enter: (slug: string) => void;
  hover: (index: number | null) => void;
  /** Inside a building: a pointer over (hover) or a click on an agent, an object or a room; null clears. */
  pick: (target: Pick | null, hover: boolean) => void;
  error: () => void;
  /** Build mode: the room cell under the pointer (null off the floor) and what a click hit. */
  build: (kind: BuildPointer, at: { room: RoomKind; cell: { x: number; z: number } } | null, pick: Pick | null) => void;
  /** The town is laid out (its first build is spread over several tasks) and about to draw. */
  ready?: () => void;
}

/** While the town is first laid out, one task builds buildings for about this long, then yields (no long task). */
const LAYOUT_SLICE_MS = 30;

const ROBOT_SCALE = 0.62;
const CIVIC_LAWN = CIVIC_LOT;
/* The camera stands this far from its target along the view direction. It is orthographic, so the distance changes
   nothing on screen, but it must clear the whole town: framing a corner plot from 90 units put the trees on the near
   side of the town behind the near plane, where they were cut into shards. Zoom does the framing; this stays fixed. */
const CAMERA_DISTANCE = 220;
const HOME_OFFSET = new THREE.Vector3(1, 1.04, 1).normalize().multiplyScalar(CAMERA_DISTANCE);
const UP = new THREE.Vector3(0, 1, 0);
/* Framing heights: a building is seen up to its tall back walls, a room up to its people and desks. */
/** Built interiors kept for a quick enter: the entered building's and the two most recently used others. */
const KEPT_INTERIORS = 3;
/** The idle time an interior build step needs left before it starts, ms. */
const IDLE_STEP_MS = 12;
const BUILDING_FRAME_HEIGHT = FLOOR_RISE + BACK_WALL_HEIGHT + 0.6; // the slab, the tall walls and a little headroom
const ROOM_FRAME_HEIGHT = 1.1;
/** On a portrait phone a room or building frame crops its diamond's outer corner tips (below 1: tighter). */
const PORTRAIT_ROOM_MARGIN = 0.86;
const PORTRAIT_BUILDING_MARGIN = 0.94;
/* The closest view: a frustum this many world units tall, about one desk with its robot. */
const DESK_SPAN = 2.4;
const HIT_GEOMETRY = new THREE.BoxGeometry(PLOT_SIZE, 2, PLOT_SIZE);
const HIT_MATERIAL = new THREE.MeshBasicMaterial();
/** The widest ground the town's shadow map covers at once (about today's town); a larger settlement gets a window of it. */
const TOWN_SHADOW_REACH = 90;
/* A robot as the labels see it: from its label anchor (just over its head) down this far to its feet, and this wide
   either side, in world units (robots stand at 0.62 scale). Other labels keep off it. */
const ROBOT_BODY = 1.0;
const ROBOT_HALF_WIDTH = 0.3;
/* The same for any cast: a figure's box is as wide as this share of its ground radius either side. */
const FIGURE_HALF_WIDTH = 1.2;
/* A hanging label pushed further than this from its anchor (pixels) is too far to read as its object's: it fades
   until the pointer is on it. */
const FAR_LABEL = 72;
/* Pushed further than this, it is hidden: on a crowded screen (a stress building, a phone) the far ones would stack
   into a column of faded text. On a phone's narrow canvas there is no room for faded ones: they hide at FAR_LABEL. The
   hovered or selected robot's plate is never hidden: it is placed first. */
const HIDDEN_LABEL = 160;
const NARROW_CANVAS = 600;
/* Labels that hang above their anchor (bottom centred on it): robots' stacks, tags, chips and counts. Building, civic
   and room signs sit beside their anchors and keep their places. */
const HANGING = /^(a|o|rule|err|p|beacon|mail|banner):|^c:[^:]+:/;
/* The HTML chrome over the canvas, in CSS pixels (App's corners, playback bar and camera toolbar): framing keeps its
   subject in the free area between them. Phones stack the corner rows and the camera buttons differently. */
interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
const NO_INSETS: Insets = { top: 0, bottom: 0, left: 0, right: 0 };
const CHROME: Insets = { top: 104, bottom: 84, left: 24, right: 76 };
const PHONE_CHROME: Insets = { top: 156, bottom: 76, left: 12, right: 60 };

export class TownScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  // The near plane lies far behind the camera: a region is wider than the camera stands off, and nothing may clip.
  readonly camera = new THREE.OrthographicCamera(-10, 10, 6, -6, -CAMERA_DISTANCE * 8, CAMERA_DISTANCE * 10);
  readonly controls: OrbitControls;
  readonly callbacks: Callbacks;
  readonly townStyle: ResolvedStyle;
  readonly walks = new Walks();
  view: TownView;
  #environment: EnvironmentHandle;
  /**
   * The town view's shadow map is drawn once and again only when something that casts or lights it changed: the sun
   * (a fit or a visible step of the drift), the dressing, a building's casters (`BuildingView.shadowRevision`), a lift.
   * Inside a building it follows every frame (robots cast there). A fit, a lift, the dressing or the quality redraw it
   * at once (`#shadowDirty`); the small, frequent changes (a pile of tickets grows, the drifting sun turns half a
   * degree) wait for the next of a few redraws a second (`#shadowSoft`, `SOFT_SHADOW_MS`): at 16x the piles alone
   * changed a dozen times a second.
   */
  #shadowDirty = true;
  #shadowSoft = false;
  /** When the town's shadow map was last drawn (performance.now()), and a pending catch-up frame. */
  #shadowDrawn = 0;
  #shadowTimer: ReturnType<typeof setTimeout> | 0 = 0;
  /** The buildings' caster revisions the town's shadow map was last drawn for. */
  #shadowCasters = -1;
  /** The environment's shadow version the shadow maps were last drawn for. */
  #shadowVersion = 0;
  #driftTimer: ReturnType<typeof setInterval> | undefined;
  /** The light's own phase, which follows the clock's at most at 4x (dayClock.ts). */
  #follow: DriftFollow = { phase: null, clock: 0, wall: 0 };
  /** The scene's own element: its backdrop (the air behind the diorama) follows the drift. */
  #host: HTMLElement;
  /** The air last written to the backdrop: colour channels and tint. */
  #air = { r: -1, g: -1, b: -1, tint: -1 };
  #buildings = new Map<string, BuildingView>();
  /** A blob contact shadow under each building's slab, sized to its footprint. */
  #contacts = new Map<string, { object: THREE.Object3D; size: string }>();
  #civic = new THREE.Group();
  #landmarks = new THREE.Group();
  /** The building shells whose window spots ambient life holds (slug and shell revision). */
  #lifeWindows = "";
  /** Clouds, birds, butterflies, fireflies, ripples, steam and glowing windows (ambientLife.ts). */
  #life: AmbientLife;
  #dressing: { signature: string; group: THREE.Group | null; instanced: THREE.InstancedMesh[]; merged: THREE.BufferGeometry[] } = {
    signature: "",
    group: null,
    instanced: [],
    merged: [],
  };
  /** Draws only the dressing near the view (a building close up draws its corner of the town, not all of it). */
  #culler: InstanceCuller | null = null;
  #sun: THREE.DirectionalLight | null | undefined;
  readonly #v2 = new THREE.Vector3();
  #lifeInside = false;
  /** The view the entered building's shadow was last fitted to. */
  #shadowFit: { zoom: number; x: number; z: number } | null = null;
  #civicSignature = "";
  #civicRobots: { handle: FigureHandle; agent: AgentPlacement }[] = [];
  /** The facts of the postman's state (reused every frame). */
  #postmanFacts: FigureFacts = { agent: null as unknown as AgentPlacement };
  /** The far robots of every building, drawn instanced (robotCrowd.ts). */
  #crowd = new RobotCrowd();
  #districts = new DistrictFrames();
  /** Which labels show at the current zoom (`labelDetail`); on the labels host as `data-detail`. */
  #detail: LabelDetail | null = null;
  /** Buildings the camera sees this frame (their far robots follow their walkers and are drawn). */
  #seen = new Set<string>();
  #frustum = new THREE.Frustum();
  #box = new THREE.Box3();
  #postman: { handle: FigureHandle; key: string; letters: THREE.Object3D[] } | null = null;
  /** Drawn frames (the stress and frame rate overlays only), and whether the loop rested before the next one. */
  #frames = new FrameRing(2048);
  #rested = true;
  /** Startup marks for the measurement script: the first drawn frame, the first with the town dressed. */
  #marked = { first: false, dressed: false };
  /** The shaders compile in parallel (`compileAsync`) before the first frame, rather than one by one inside it. */
  #warm: "cold" | "warming" | "warm" = "cold";
  #hits = new THREE.Group();
  #ring: THREE.Object3D;
  /** A soft glow round the focused or hovered plot, under the focus ring; that building lifts a little (not under
      reduced motion: the glow and the ring alone show it then). */
  #glow: THREE.Object3D;
  #lifted: string | null = null;
  #anchors = new Map<string, THREE.Vector3>();
  #labelsHost: HTMLElement;
  #labels: Label[] = [];
  #stacks: Label[] = [];
  #signs: Label[] = [];
  /** The entered building's robots on screen this frame (a pool, reused). */
  #robotBoxes: RobotBox[] = [];
  #span = 30;
  #raf = 0;
  #last = 0;
  #disposed = false;
  #dirtyFrames = 2;
  /** True until the first layout of the town is complete; nothing draws before. */
  #layingOut = true;
  /** Buildings going up (construction.ts), and the slugs the town has shown: a new one gets scaffolding first. */
  readonly #constructions = new Map<string, Construction>();
  readonly #known = new Set<string>();
  #layoutTimer: ReturnType<typeof setTimeout> | 0 = 0;
  #down = { x: 0, y: 0 };
  #hovered: number | null = null;
  #hitsKey = "";
  #fitKey = "";
  /** True while the camera shows the home frame: a visitor who moved it is left alone when the town grows. */
  #atHome = true;
  /** Buildings holding a built interior, most recently used last (buildingView.ts prepareInterior). */
  #interiors: string[] = [];
  #cancelPrepare: (() => void) | null = null;
  /** The building whose interior is being built in idle time. */
  #preparing: string | null = null;
  #hoverPick = "";
  #tween: { position: THREE.Vector3; target: THREE.Vector3; zoom: number } | null = null;
  #resize: ResizeObserver;
  #perf: { frames: number; total: number; worst: number; since: number } | null = null;
  // Scratch objects: the frame loop and picking allocate nothing.
  #ray = new THREE.Raycaster();
  #pointer = new THREE.Vector2();
  #v = new THREE.Vector3();
  #projection = new THREE.Matrix4();
  #offset = new THREE.Vector3();
  #right = new THREE.Vector3();
  #up = new THREE.Vector3();
  #hitList: THREE.Intersection[] = [];
  #floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.19);
  #floorHit = new THREE.Vector3();
  #buildCell = "";
  #dragging = false;
  #stopIntents: () => void;
  readonly #previewLooks = previewLooks(globalThis.location?.search ?? "", townBounds());

  constructor(host: HTMLElement, labels: HTMLElement, view: TownView, callbacks: Callbacks) {
    this.view = view;
    this.callbacks = callbacks;
    this.#labelsHost = labels;
    this.#host = host;
    this.townStyle = styleRegistry.styleFor(null);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.debug.onShaderError = () => this.callbacks.error();
    // The canvas stays transparent: the UI background (and its evening or daylight air) shows around the town.
    this.renderer.setClearColor(0, 0);
    // Soft shadows come from the light's shadow radius (three's PCF filter); Fast turns shadow maps off.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.applyQuality(view.quality, false);
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute(
      "aria-label",
      "The town. Arrow keys move between buildings, Enter goes inside. Inside a building arrow keys move between rooms, Enter zooms to a room, Escape goes back one level. Plus and minus zoom, brackets rotate, H returns home. D shows every label. T opens the text view.",
    );
    host.appendChild(canvas);
    this.camera.position.copy(HOME_OFFSET);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = !view.reducedMotion;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = false;
    this.controls.minZoom = 0.6;
    this.controls.maxZoom = 16;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.2;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.addEventListener("start", this.cancelTween);
    this.controls.addEventListener("start", this.#leftHome);
    this.controls.addEventListener("change", this.invalidate);
    this.#environment = this.townStyle.environment(this.scene, this.renderer, view.theme);
    this.#environment.setQuality(view.quality);
    this.fitShadow();
    this.#shadowVersion = this.#environment.shadowVersion;
    this.#ring = this.townStyle.model("focus-ring", { size: { width: PLOT_SIZE + 0.4, height: 0, depth: PLOT_SIZE + 0.4 } });
    this.#ring.visible = false;
    // Just inside the hedges on the plot's rim, which would hide it.
    this.#glow = this.townStyle.model("focus-glow", { size: { width: PLOT_SIZE - 3, height: 0, depth: PLOT_SIZE - 3 } });
    this.#glow.visible = false;
    this.scene.add(this.#glow);
    // Cloud shadows go to the light rig, which dims the key light under them on everything (when the style can).
    const environment = this.#environment;
    this.#life = new AmbientLife(this.townStyle, environment.setCloudShadows ? (clouds) => environment.setCloudShadows!(clouds) : null);
    this.scene.add(this.#hits, this.#ring, this.#civic, this.#life.group, this.#crowd.group);
    // The frame loop brings world matrices up to date itself, for what moved only (matrixPass.ts).
    this.scene.matrixWorldAutoUpdate = false;
    this.#drift();
    this.#driftTimer = setInterval(this.#drift, DRIFT_INTERVAL_MS);
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerleave", this.pointerLeave);
    canvas.addEventListener("webglcontextlost", this.contextLost);
    document.addEventListener("visibilitychange", this.visibility);
    // Dev builds: the scene on `window.__town` for headless checks of walks and frame statistics.
    if (import.meta.env.DEV) (window as unknown as { __town?: TownScene }).__town = this;
    if (new URLSearchParams(window.location.search).has("perf")) this.#perf = { frames: 0, total: 0, worst: 0, since: performance.now() };
    // Accepted director intents walk through the walk runtime (entered building only, never under reduced motion).
    this.#stopIntents = onPlayIntent((played) => {
      if (played) this.walks.direct(played.intent);
      else this.walks.endDirected();
      this.invalidate();
    });
    this.#resize = new ResizeObserver(this.resize);
    this.#resize.observe(host);
    // The ground, then the town's dressing and buildings, each in tasks of their own (see sync).
    this.#layoutTimer = setTimeout(() => {
      this.#layoutTimer = 0;
      if (this.#disposed) return;
      this.buildGround();
      this.#continueLayout();
    }, 0);
    this.resize();
    this.home(true);
    this.setView(view);
  }

  /**
   * The day-night drift: a few times a second the light takes the time of day from the source clock, and the scene
   * redraws one frame when it changed. A theme change re-applies it at once; reduced motion, Fast and the setting off
   * keep the theme's own light. The ambient life follows the evening (fireflies, lit windows); the town's shadow map
   * is redrawn only when the sun moved a visible step.
   */
  #drift = () => {
    if (this.#disposed || document.hidden) return;
    const v = this.view;
    const clock = v.dayClock();
    const target = driftPhase({ dayNight: v.dayNight, reducedMotion: v.reducedMotion, quality: v.quality, sinceStartMs: clock });
    // At high playback speeds the light keeps a graceful pace of its own (followPhase).
    this.#follow = followPhase(this.#follow, target, clock, performance.now());
    const changed = this.#environment.setDayPhase(this.#follow.phase);
    this.#life.setEvening(this.#environment.evening);
    this.#tintAir();
    if (!changed) return;
    if (this.#environment.shadowVersion !== this.#shadowVersion) {
      this.#shadowVersion = this.#environment.shadowVersion;
      this.#shadowSoft = true;
    }
    this.redraw();
  };

  /**
   * The air behind the diorama follows the light: the style's air colour, mixed into the theme's own air (world.css)
   * by its tint, as two custom properties on the scene's element. Written only when it changed; the HTML chrome keeps
   * the theme's colours.
   */
  #tintAir() {
    const { color, tint } = this.#environment.air;
    const a = this.#air;
    // Steps of about one percent: during a dusk the backdrop repaints about once a second, never per frame.
    if (Math.abs(a.r - color.r) + Math.abs(a.g - color.g) + Math.abs(a.b - color.b) < 0.015 && Math.abs(a.tint - tint) < 0.012) return;
    Object.assign(a, { r: color.r, g: color.g, b: color.b, tint });
    this.#host.style.setProperty("--drift-air", `#${color.getHexString()}`);
    this.#host.style.setProperty("--drift-air-tint", `${(tint * 100).toFixed(1)}%`);
  }

  /** Draws one more frame (a light change), without the longer settling run of `invalidate`. */
  redraw() {
    this.#dirtyFrames = Math.max(this.#dirtyFrames, 1);
    if (!this.#raf && !this.#disposed && !document.hidden) this.#raf = requestAnimationFrame(this.animate);
  }

  /** Every style in use follows the theme: the town's (through its environment) and each building's. */
  applyTheme(theme: StyleTheme) {
    this.#environment.setTheme(theme);
    for (const view of this.#buildings.values()) if (view.ctx.style !== this.townStyle) view.ctx.style.setTheme(theme);
    this.invalidate();
  }

  /** Pretty: shadow maps and a sharp canvas (up to 2× pixels). Fast: no shadow maps, one pixel per CSS pixel. */
  applyQuality(quality: GraphicsQuality, live = true) {
    const pretty = quality === "pretty";
    this.renderer.shadowMap.enabled = pretty;
    this.#shadowDirty = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pretty ? 2 : 1));
    if (!live) return;
    this.#environment.setQuality(quality);
    this.resize();
  }

  /**
   * The key light's shadow covers what the camera frames: inside a building, the ground the camera sees (at least the
   * building) gets a close, crisp shadow map; the town a cheaper, softer one over every lot. A map smaller than the
   * view would cut the shadows of the trees round the building into sharp shards at its edge, so a zoom or pan that
   * shows more ground fits it again (`#refitShadow`).
   */
  fitShadow() {
    const view = this.view.entered ? this.#buildings.get(this.view.entered) : undefined;
    if (!view) {
      // The town's shadow map covers the whole settlement while that keeps it crisp enough; a region gets the part
      // around what the camera looks at, and a pan fits it again (`#refitShadow`).
      const b = this.view.plan.ground;
      const whole = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 4;
      const target = this.#tween?.target ?? this.controls.target;
      if (whole <= TOWN_SHADOW_REACH) {
        this.#environment.setShadowReach(whole, { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 });
        this.#shadowFit = null;
      } else {
        this.#environment.setShadowReach(TOWN_SHADOW_REACH, { x: target.x, z: target.z });
        this.#shadowFit = { zoom: this.camera.zoom, x: target.x, z: target.z };
      }
      // A new fit refreshes the shadow map on the next drawn frame, also in the town view.
      this.#shadowDirty = true;
      this.invalidate();
      return;
    }
    const b = view.bounds(null);
    const zoom = this.#tween?.zoom ?? this.camera.zoom,
      target = this.#tween?.target ?? this.controls.target;
    const canvas = this.renderer.domElement;
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight) || 1;
    // The view's half height and width on screen, in world units; seen from above at an angle, the ground it covers
    // runs deeper by 1 / sin(elevation). Shadows of trees just outside it still fall in: a margin for them.
    const halfH = this.#span / 2 / Math.max(zoom, 0.01),
      elevation = this.#v.copy(this.camera.position).sub(this.controls.target).normalize().y;
    const seen = Math.hypot(halfH * aspect, halfH / Math.max(0.3, elevation)) + 4;
    const reach = Math.min(Math.max(Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 2, seen), 60);
    this.#environment.setShadowReach(reach, { x: target.x, z: target.z });
    this.#shadowFit = { zoom, x: target.x, z: target.z };
    this.#shadowDirty = true;
    this.invalidate();
  }

  /** Inside a building: fits the shadow again once a zoom or pan has changed the ground in view noticeably. */
  #refitShadow() {
    const fit = this.#shadowFit;
    if (!fit || this.#tween) return;
    const t = this.controls.target;
    // In a region the map follows the pan in large steps: it covers far more than the step.
    if (!this.view.entered) {
      if (Math.hypot(t.x - fit.x, t.z - fit.z) > TOWN_SHADOW_REACH / 3) this.fitShadow();
      return;
    }
    if (Math.abs(this.camera.zoom / fit.zoom - 1) > 0.12 || Math.hypot(t.x - fit.x, t.z - fit.z) > 2) this.fitShadow();
  }

  /* ── The town ground and the empty lots ───────────────────────────────── */

  /** The plot hit boxes and the civic landmarks; the ground and its dressing follow the plots in use (`#dress`). */
  buildGround() {
    const style = this.townStyle;
    // The landmarks merge per material; the square's fountain water stays live (`userData.live`) and animates.
    const landmarks: [ModelKey, number, number, number][] = [
      ["post-office", civicCenter("post-office").x, LAWN_Y, civicCenter("post-office").z],
      ["town-hall", civicCenter("town-hall").x, LAWN_Y, civicCenter("town-hall").z],
      ["civic.square", civicCenter("square").x, GRASS_Y, civicCenter("square").z],
      ["civic.cafe", civicCenter("cafe").x, GRASS_Y, civicCenter("cafe").z],
      ["civic.bus-stop", civicCenter("bus-stop").x, GRASS_Y, civicCenter("bus-stop").z],
    ];
    for (const [key, x, y, z] of landmarks) {
      const object = this.#styleAt(x, z).model(key);
      object.position.set(x, y, z);
      this.#landmarks.add(object);
    }
    // The reserved landmarks (welcome sign, windmill, greenhouse, ducks…) appear once the style draws them.
    const covered = new Set<string>(style.manifest.coveredKeys);
    for (const l of townLandmarks()) {
      if (!covered.has(l.key)) continue;
      const object = this.#styleAt(l.x, l.z).model(l.key as ModelKey);
      object.position.set(l.x, l.y, l.z);
      object.rotation.y = l.rotation;
      this.#landmarks.add(object);
    }
    // Landmarks are static but for their live parts (the fountain's water): the rest merges per material across all of
    // them (perf). The landmark roots stay, so their animations still run.
    mergeStatic(this.#landmarks);
    this.scene.add(this.#landmarks);
  }

  /**
   * The ground, lawns, paths and dressing for the plots in use (townDressing.ts): rebuilt only when a plot is taken or
   * freed. Repeated parts become instanced meshes, the one-off pieces merge per material.
   */
  #dress() {
    const plan = this.view.plan;
    // Fast quality leaves out the small detail (grass tufts, wild flowers).
    const fast = this.view.quality === "fast";
    const townOptions = townLook(this.#lookContext()).styleOptions;
    // Each building's own garden follows its slug, its lot and whether it is archived.
    const signature = `${planKey(plan)}|${fast}|${looksSignature(this.#looks)}|${styleOptionsKey(townOptions)}`;
    if (signature === this.#dressing.signature) return;
    this.#disposeDressing();
    this.#shadowDirty = true;
    const group = new THREE.Group();
    // Until the settlement dressing lands (settlementDressing.ts), the old dressing knows the 4 x 3 grid only: a lot
    // on that grid is dressed as its grid plot, any other lot stands on bare ground.
    const plots = plan.lots.flatMap((lot) => {
      const column = lot.cell.x - 63,
        row = lot.cell.z - 64;
      if (column < 0 || column >= TOWN_COLUMNS || row < 0 || row * TOWN_COLUMNS + column >= TOWN_CAPACITY) return [];
      return [{ index: row * TOWN_COLUMNS + column, door: plotDoor(lot.cell), obstacles: plotObstacles(lot.cell), seed: slugSeed(lot.slug), archived: lot.archived }];
    });
    const dressing = townDressing(plots);
    this.#life.setTown(dressing, this.#landmarks);
    // A district's own turf lies on the town's ground, in its look's grass.
    for (const { bounds } of this.#looks?.districts ?? []) {
      const turf = this.#styleAt((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2, townOptions).model("town.turf", {
        size: { width: bounds.maxX - bounds.minX, height: 0, depth: bounds.maxZ - bounds.minZ },
      });
      turf.position.set((bounds.minX + bounds.maxX) / 2, turf.position.y, (bounds.minZ + bounds.maxZ) / 2);
      group.add(turf);
    }
    for (const d of dressing) {
      if (fast && d.detail) continue;
      // The whole ground is the town's; everything else wears the look of the district it stands in.
      const style = d.key === "ground" ? this.#styleAt(Infinity, Infinity, townOptions) : this.#styleAt(d.x, d.z, townOptions);
      const object = style.model(d.key as ModelKey, {
        ...(d.size ? { size: d.size } : {}),
        ...(d.seed !== undefined ? { seed: d.seed } : {}),
        ...(d.variant ? { variant: d.variant } : {}),
      });
      object.position.set(d.x, d.y, d.z);
      object.rotation.y = d.rotation;
      object.scale.setScalar(d.scale);
      group.add(object);
    }
    const instanced = instanceStatic(group);
    const merged = mergeStatic(group);
    this.scene.add(group);
    this.#culler = new InstanceCuller(instanced);
    this.#dressing = { signature, group, instanced, merged };
  }

  /** The look of the town and its districts: the view's, else the address bar's preview. */
  get #looks(): TownLooks | null {
    return this.view.looks === undefined ? this.#previewLooks : this.view.looks;
  }

  /**
   * The town's style as it is worn at a spot: the town's own look (the viewer's and the town document's picks), and
   * over it the picks of the district that stands there.
   */
  #styleAt(x: number, z: number, town: StyleOptionValues = townLook(this.#lookContext()).styleOptions): ResolvedStyle {
    const district = lookAt(this.#looks, x, z);
    return this.townStyle.withOptions(district ? { ...town, ...district } : town);
  }

  #disposeDressing() {
    const { group, instanced, merged } = this.#dressing;
    if (!group) return;
    group.removeFromParent();
    for (const mesh of instanced) mesh.dispose();
    this.#culler = null;
    for (const geometry of merged) geometry.dispose();
    this.#dressing = { signature: "", group: null, instanced: [], merged: [] };
  }

  /* ── Model → scene ────────────────────────────────────────────────────── */

  sync() {
    const started = performance.now();
    let created = 0,
      deferred = false;
    const model = this.view.model,
      plan = this.view.plan;
    this.#dress();
    this.#layHits();
    this.#fitPlan();
    const lots = new Map(plan.lots.map((l) => [l.slug, l]));
    // The first layout waits for every building's lot (the allocation follows the first model within a moment).
    if (this.#layingOut && plan.pending > 0) return;
    // The town's dressing is a slice of its own in the first layout.
    if (this.#layingOut && performance.now() - started > LAYOUT_SLICE_MS && this.#buildings.size < plan.lots.length) {
      this.#continueLayout();
      return;
    }
    this.walks.update(model, { entered: this.view.entered, reducedMotion: this.view.reducedMotion, ambient: this.view.ambient, plan });
    const seen = new Set<string>();
    this.#anchors.clear();
    model.buildings.forEach((b) => {
      // A building stands on its lot; one whose lot is still on its way (the allocation) is not drawn yet.
      const lot = lots.get(b.slug);
      if (!lot) return;
      seen.add(b.slug);
      let view = this.#buildings.get(b.slug);
      // The first layout builds a slice of buildings per task (at least one), then yields; the rest follow.
      if (this.#layingOut && !view && created > 0 && performance.now() - started > LAYOUT_SLICE_MS) {
        deferred = true;
        return;
      }
      const c = lot.centre;
      // The building's look: its plot's, then its zone's, the viewer's, the town's, the style's default (`look.ts`).
      const look = buildingLook(this.#lookContext(), b.slug);
      const plot: StyledPlot = { styleId: look.styleId };
      const style = styleRegistry.styleFor(plot, { ...look.styleOptions, ...lookAt(this.#looks, c.x, c.z) });
      const cast = castRegistry.castFor(style, look.castId);
      if (!view || view.group.userData.lot !== lotKey(lot.cell) || view.ctx.style !== style) {
        view?.dispose();
        if (style !== this.townStyle) style.setTheme(this.view.theme);
        view = new BuildingView(b, c, PLOT_SIZE, {
          style,
          cast,
          now: () => this.view.now(),
          reducedMotion: () => this.view.reducedMotion,
          walker: (key) => this.walks.walker(key),
        });
        view.group.userData.lot = lotKey(lot.cell);
        created++;
        this.#buildings.set(b.slug, view);
        this.scene.add(view.group);
        // A project that joins a standing town goes up in scaffolding; the first layout and a re-dress do not.
        this.#constructions.get(b.slug)?.finish();
        this.#constructions.delete(b.slug);
        if (!this.#layingOut && !this.#known.has(b.slug) && this.view.entered !== b.slug) {
          const going = new Construction(this.townStyle, view.group, view.bounds(null), LAWN_Y, this.view.theme, this.view.reducedMotion);
          this.#constructions.set(b.slug, going);
          this.scene.add(going.group);
        }
        this.#known.add(b.slug);
      }
      // A cast chosen in Settings (or by the town document) swaps the figures where they stand and walk.
      view.setCast(cast);
      const town = this.view.town;
      view.update(b, this.view.entered === b.slug, town && (this.view.entered === b.slug ? town : { ...town, build: null }), zoneById(model.zones, b.zoneId));
      if (this.view.entered === b.slug) this.#useInterior(b.slug);
      view.setFocus(this.view.entered === b.slug ? this.view.room : null);
      for (const [id, v] of view.anchors) this.#anchors.set(id, v);
      this.#contact(b.slug, view);
      this.#anchors.set(`b:${b.slug}`, new THREE.Vector3(c.x, 0.2, c.z + PLOT_SIZE / 2));
    });
    this.#districts.update(this.view.districts ?? [], (slug) => this.#buildings.get(slug)?.bounds(null) ?? null, this.#anchors);
    // Ambient life lights the buildings' windows in lamplight; gather their spots again when a shell changed.
    const windows = [...this.#buildings.values()].map((v) => `${v.building.slug}:${v.shellRevision}`).join();
    if (windows !== this.#lifeWindows) {
      this.#lifeWindows = windows;
      this.#life.setBuildingWindows([...this.#buildings.values()].filter((v) => seen.has(v.building.slug)).map((v) => v.group));
    }
    for (const [slug, view] of this.#buildings)
      if (!seen.has(slug)) {
        this.#constructions.get(slug)?.finish();
        this.#constructions.delete(slug);
        this.#known.delete(slug);
        view.dispose();
        this.#buildings.delete(slug);
        this.#contacts.get(slug)?.object.removeFromParent();
        this.#contacts.delete(slug);
      }
    this.syncCivic();
    if (this.#layingOut) {
      if (deferred) this.#continueLayout();
      else {
        this.#layingOut = false;
        this.callbacks.ready?.();
      }
    }
    this.invalidate();
    this.#prepareInterior();
  }

  /** The next slice of the first layout, in a task of its own, so the page stays responsive while the town builds. */
  #continueLayout() {
    if (this.#layoutTimer) return;
    this.#layoutTimer = setTimeout(() => {
      this.#layoutTimer = 0;
      if (!this.#disposed) this.sync();
    }, 0);
  }

  /** Marks a building's interior as just used and drops the oldest beyond the few kept (never the entered one). */
  #useInterior(slug: string) {
    if (this.#interiors[this.#interiors.length - 1] === slug) return;
    this.#interiors = [...this.#interiors.filter((s) => s !== slug), slug];
    while (this.#interiors.length > KEPT_INTERIORS) this.#buildings.get(this.#interiors.shift()!)?.releaseInterior();
  }

  /**
   * In the town, while the browser is idle, builds the interior of the building the pointer is over or the keyboard
   * has focused, so entering it only has to show it.
   */
  #prepareInterior() {
    if (this.#cancelPrepare || this.#layingOut || this.view.entered) return;
    const run = (more: () => boolean) => {
      this.#cancelPrepare = null;
      if (this.#disposed || this.view.entered) return;
      const index = this.#hovered ?? this.view.focused;
      const slug = this.view.model.buildings[index]?.slug;
      const view = slug ? this.#buildings.get(slug) : undefined;
      if (!slug || !view) return;
      // One build at a time: a build for a building the visitor has moved on from is given up.
      if (this.#preparing !== slug) this.#buildings.get(this.#preparing ?? "")?.cancelPrepare();
      this.#preparing = slug;
      if (view.prepareInterior(more)) this.#useInterior(slug);
      // Not done in this slice: go on in the next idle time.
      if (view.preparing) this.#prepareInterior();
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback((deadline) => run(() => deadline.timeRemaining() > IDLE_STEP_MS), { timeout: 1500 });
      this.#cancelPrepare = () => cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(() => {
        const start = performance.now();
        run(() => performance.now() - start < IDLE_STEP_MS);
      }, 300);
      this.#cancelPrepare = () => window.clearTimeout(id);
    }
  }

  /** The blob shadow under a building's slab follows its footprint (role rooms grow east). */
  #contact(slug: string, view: BuildingView) {
    const b = view.bounds(null);
    const size = `${(b.maxX - b.minX).toFixed(2)}x${(b.maxZ - b.minZ).toFixed(2)}`;
    const current = this.#contacts.get(slug);
    if (current?.size === size) return;
    current?.object.removeFromParent();
    const object = this.townStyle.model("town.contact-shadow", { size: { width: b.maxX - b.minX, height: 0, depth: b.maxZ - b.minZ } });
    object.position.set((b.minX + b.maxX) / 2, view.group.position.y + 0.004, (b.minZ + b.maxZ) / 2);
    this.scene.add(object);
    this.#contacts.set(slug, { object, size });
  }

  #lookContext(): LookContext {
    const { model, town, cast, styleOptions } = this.view;
    return { doc: town?.doc, zones: model.zones, buildings: model.buildings, viewer: { castId: cast, styleOptions } };
  }

  /** The cast of the town itself (its postman and town hall): the viewer's choice, else the town document's, else the style's default. */
  #townCast(): Cast {
    return castRegistry.castFor(this.townStyle, townLook(this.#lookContext()).castId);
  }

  /** The postman at the post office and the agents in the town hall. */
  syncCivic() {
    const model = this.view.model;
    const civic = [...model.postOffice.slice(0, 2), ...model.townHall.slice(0, 5)];
    const cast = this.#townCast();
    const signature = `${cast.manifest.id}|` + civic.map((a) => `${a.key}:${a.posture}:${a.laneStatus}`).join("|") + model.freshness.stale;
    const post = civicCenter("post-office"),
      hall = civicCenter("town-hall");
    this.#anchors.set("c:post-office", new THREE.Vector3(post.x, 0.2, post.z + CIVIC_LAWN / 2));
    this.#anchors.set("c:town-hall", new THREE.Vector3(hall.x, 0.2, hall.z + CIVIC_LAWN / 2));
    if (signature === this.#civicSignature) return;
    this.#civicSignature = signature;
    this.#shadowDirty = true;
    for (const robot of this.#civicRobots) robot.handle.dispose();
    this.#civicRobots = [];
    this.#postman = null;
    const place = (agent: AgentPlacement, x: number, z: number, where: FigurePlace) => {
      const handle = cast.figure({ key: agent.key, accent: null, role: figureRole(agent, where) });
      handle.object.position.set(x, 0.2, z);
      handle.object.scale.setScalar(ROBOT_SCALE * 1.4);
      handle.setState(figureState({ agent }));
      this.#civic.add(handle.object);
      this.#civicRobots.push({ handle, agent });
    };
    model.postOffice.slice(0, 2).forEach((a, i) => place(a, post.x - 0.5 + i, post.z + 0.4, "post-office"));
    const postman = model.postOffice[0];
    const handle = postman && this.#civicRobots[0]?.handle;
    if (postman && handle) {
      // The postman walks the town at the interiors' scale; the letters it carries ride at its carry anchor.
      handle.object.scale.setScalar(ROBOT_SCALE * 1.15);
      const [x, y, z] = handle.anchors.carry;
      const letters = [0, 1, 2].map((i) => {
        const letter = this.townStyle.model("letter");
        letter.position.set(x, y + i * 0.07, z);
        letter.rotation.x = -0.35;
        letter.visible = false;
        handle.object.add(letter);
        return letter;
      });
      this.#postman = { handle, key: postman.key, letters };
      this.#unshadowPostman();
    }
    model.townHall.slice(0, 5).forEach((a, i) => place(a, hall.x - 1.6 + i * 0.8, hall.z + 1.3, "town-hall"));
  }

  /** The postman walks the whole town: its soft blob shadow goes along, a sun shadow would hold the town's map on every step. */
  #unshadowPostman() {
    this.#postman?.handle.object.traverse((o) => (o.castShadow = false));
  }

  /** Picks up the label elements React rendered; call after every render that can change them. */
  refreshLabels() {
    const previous = new Map(this.#labels.map((l) => [l.el, l]));
    this.#labels = [...this.#labelsHost.querySelectorAll<HTMLElement>("[data-anchor]")].map(
      (el) =>
        previous.get(el) ?? { el, id: "", half: 0, height: 0, stack: false, sign: false, robot: false, picked: false, shown: false, x: Number.NaN, y: Number.NaN, nx: 0, ny: 0, ay: 0, visible: false, far: false, yields: false },
    );
    for (const l of this.#labels) {
      l.id = l.el.dataset.anchor ?? "";
      const box = l.el.firstElementChild as HTMLElement | null;
      l.half = (box?.offsetWidth ?? 0) / 2;
      l.height = box?.offsetHeight ?? 0;
      l.stack = HANGING.test(l.id);
      l.sign = l.id.startsWith("r:");
      l.robot = l.id.startsWith("a:");
      l.picked = l.el.classList.contains("picked");
      l.x = Number.NaN;
    }
    this.invalidate();
  }

  /* ── View, camera and input ────────────────────────────────────────────── */

  setView(view: TownView) {
    const previous = this.view;
    this.view = view;
    this.controls.enableDamping = !view.reducedMotion;
    if (previous.theme !== view.theme) this.applyTheme(view.theme);
    if (previous.quality !== view.quality) {
      this.applyQuality(view.quality);
      this.#dress();
    }
    if (previous.cast !== view.cast) this.#shadowDirty = true;
    if (previous.cast !== view.cast || previous.styleOptions !== view.styleOptions || previous.model !== view.model || previous.plan !== view.plan || previous.entered !== view.entered || previous.room !== view.room || previous.town !== view.town) this.sync();
    else if (previous.reducedMotion !== view.reducedMotion || previous.ambient !== view.ambient)
      this.walks.update(view.model, { entered: view.entered, reducedMotion: view.reducedMotion, ambient: view.ambient, plan: view.plan });
    if (previous.entered !== view.entered) {
      // The overlay's window describes one view: start it again.
      this.#frames.clear();
      if (view.entered) this.frameBuilding(view.entered, view.zoomed);
      else this.#frameOutside();
      this.fitShadow();
    } else if (view.entered && previous.zoomed !== view.zoomed) this.frameBuilding(view.entered, view.zoomed);
    else if (!view.entered && (previous.district ?? null) !== (view.district ?? null)) this.#frameOutside();
    this.#life.configure({ ambient: view.ambient, reducedMotion: view.reducedMotion, quality: view.quality });
    if (previous.theme !== view.theme || previous.quality !== view.quality || previous.reducedMotion !== view.reducedMotion || previous.dayNight !== view.dayNight) this.#drift();
    if (previous.entered !== view.entered || !view.entered !== !this.#lifeInside) {
      const inside = view.entered ? this.#buildings.get(view.entered) : undefined;
      this.#life.setBuilding(inside ? inside.bounds(null) : null);
      this.#lifeInside = !!inside;
    }
    const focusedSlug = view.model.buildings[view.focused]?.slug;
    const p = view.plan.lots.find((l) => l.slug === focusedSlug)?.centre;
    if (p) {
      this.#ring.position.set(p.x, 0.2, p.z);
      this.#glow.position.set(p.x, 0.32, p.z);
    }
    this.#ring.visible = view.ringVisible && !view.entered && !!p;
    this.#glow.visible = this.#ring.visible;
    this.#lifted = this.#ring.visible ? (focusedSlug ?? null) : null;
    if (previous.entered && previous.entered !== view.entered) {
      const left = this.#buildings.get(previous.entered);
      left?.setHover(null);
      left?.setSelected(null);
    }
    if (view.entered) this.#buildings.get(view.entered)?.setSelected(view.selectedAgent ?? null);
    this.refreshLabels();
    this.#prepareInterior();
  }

  /** The frustum height (at zoom 1) that frames `bounds` from the current camera direction. */
  spanFor(bounds: Bounds, height: number): number {
    return this.frameRects([bounds], height, this.#v.copy(this.camera.position).sub(this.controls.target)).span;
  }

  /** The chrome over the canvas at its current size. */
  insets(): Insets {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!width || !height) return NO_INSETS;
    const chrome = width < 600 ? PHONE_CHROME : CHROME;
    // A short or narrow canvas never gives more than a third of an axis to the chrome.
    const fit = (a: number, b: number, size: number) => Math.min(1, size / 3 / Math.max(1, a + b));
    const fy = fit(chrome.top, chrome.bottom, height),
      fx = fit(chrome.left, chrome.right, width);
    return { top: chrome.top * fy, bottom: chrome.bottom * fy, left: chrome.left * fx, right: chrome.right * fx };
  }

  /**
   * Frames the projected corners of `rects` (each up to `height`) seen along `direction` (camera minus target): the
   * frustum height at zoom 1 and the ground point to aim at so they sit centred in the canvas less `insets`.
   */
  frameRects(rects: readonly Bounds[], height: number, direction: THREE.Vector3, insets: Insets = NO_INSETS, margin = 1.04): { span: number; target: THREE.Vector3 } {
    this.#offset.copy(direction).normalize();
    this.#right.crossVectors(UP, this.#offset).normalize();
    this.#up.crossVectors(this.#offset, this.#right).normalize();
    let u0 = Infinity,
      u1 = -Infinity,
      v0 = Infinity,
      v1 = -Infinity;
    const p = new THREE.Vector3();
    for (const r of rects)
      for (const x of [r.minX, r.maxX])
        for (const z of [r.minZ, r.maxZ])
          for (const y of [0, height]) {
            p.set(x, y, z);
            const u = p.dot(this.#right),
              v = p.dot(this.#up);
            u0 = Math.min(u0, u);
            u1 = Math.max(u1, u);
            v0 = Math.min(v0, v);
            v1 = Math.max(v1, v);
          }
    const canvas = this.renderer.domElement;
    const canvasWidth = Math.max(1, canvas.clientWidth),
      canvasHeight = Math.max(1, canvas.clientHeight);
    const aspect = canvasWidth / canvasHeight;
    // The free area's share of each axis, and its centre's offset from the canvas centre in pixels (right, down).
    const fy = Math.max(0.2, 1 - (insets.top + insets.bottom) / canvasHeight),
      fx = Math.max(0.2, 1 - (insets.left + insets.right) / canvasWidth);
    const span = Math.max((v1 - v0) / fy, (u1 - u0) / (aspect * fx)) * margin;
    const perPixel = span / canvasHeight;
    const uc = (u0 + u1) / 2 - ((insets.left - insets.right) / 2) * perPixel,
      vc = (v0 + v1) / 2 + ((insets.top - insets.bottom) / 2) * perPixel;
    // The screen centre (uc, vc), slid along the view direction down to the ground.
    const target = this.#right.clone().multiplyScalar(uc).addScaledVector(this.#up, vc);
    target.addScaledVector(this.#offset, -target.y / this.#offset.y);
    return { span, target };
  }

  /**
   * The home frame. On a portrait phone it frames tight (`homeRects` compact) and lets the town run under the side
   * controls, so the town fills the tall screen instead of floating small in its middle.
   */
  #homeFrame() {
    const canvas = this.renderer.domElement;
    const portrait = canvas.clientWidth < canvas.clientHeight * 0.8;
    const insets = this.insets();
    const rects = homeRects(this.view.plan, portrait ? 0 : 1.5, portrait);
    return this.frameRects(rects, 2, HOME_OFFSET, portrait ? { ...insets, left: 0, right: 0 } : insets);
  }

  home(immediate: boolean) {
    const { target } = this.#homeFrame();
    this.#atHome = true;
    this.moveTo(target, target.clone().add(HOME_OFFSET), 1, immediate);
  }

  /** One pickable box per building, on its lot; `userData.plot` is the building's index in the model. */
  #layHits() {
    const plan = this.view.plan;
    const key = this.view.model.buildings.map((b) => b.slug).join() + "|" + planKey(plan);
    if (key === this.#hitsKey) return;
    this.#hitsKey = key;
    const lots = new Map(plan.lots.map((l) => [l.slug, l]));
    this.#hits.clear();
    this.view.model.buildings.forEach((b, index) => {
      const lot = lots.get(b.slug);
      if (!lot) return;
      const hit = new THREE.Mesh(HIT_GEOMETRY, HIT_MATERIAL);
      hit.visible = false;
      hit.position.set(lot.centre.x, 1, lot.centre.z);
      hit.userData.plot = index;
      this.#hits.add(hit);
    });
    this.#hits.updateMatrixWorld(true);
  }

  /**
   * The settlement changed size (a tier, a new district, the first building): the zoom-1 frustum follows the new
   * home frame. A camera that was at home goes home again, gently; one the visitor moved keeps looking at the same
   * ground at the same scale.
   */
  #fitPlan() {
    const plan = this.view.plan;
    const key = `${plan.tier}|${plan.lots.map((l) => lotKey(l.cell)).join(";")}`;
    if (key === this.#fitKey) return;
    this.#fitKey = key;
    const before = this.#span;
    this.resize();
    // The first layout simply starts at home.
    if (this.#layingOut) {
      if (!this.view.entered) this.home(true);
      return;
    }
    if (Math.abs(this.#span - before) < 1e-3) return;
    if (this.view.entered) {
      this.camera.zoom *= this.#span / before;
      if (this.#tween) this.#tween.zoom *= this.#span / before;
      this.camera.updateProjectionMatrix();
    } else if (this.#atHome) {
      // Start from the frame the visitor was looking at, then ease to the new home.
      this.camera.zoom = this.#span / before;
      this.camera.updateProjectionMatrix();
      this.home(false);
    } else {
      this.camera.zoom *= this.#span / before;
      this.camera.updateProjectionMatrix();
    }
    this.fitShadow();
  }

  /**
   * Frames the entered building close: its template footprint (with the step before its door) fills the free canvas,
   * or, given a room, that room does. The view direction stays (a rotation survives); only target and zoom move.
   */
  frameBuilding(slug: string, room: RoomKind | null) {
    const view = this.#buildings.get(slug);
    if (!view) return;
    const o = view.group.position,
      size = view.template.size;
    const bounds: Bounds = room
      ? view.bounds(room)
      : { minX: o.x - 0.3, maxX: o.x + size.width * BUILDING_CELL + 0.3, minZ: o.z - 0.3, maxZ: o.z + size.depth * BUILDING_CELL + 0.9 };
    const direction = (this.#tween ? this.#tween.position.clone().sub(this.#tween.target) : this.camera.position.clone().sub(this.controls.target)).normalize();
    // On a portrait phone the width binds: the room (or building) runs under the side controls and its diamond's outer
    // corner tips may leave the screen, so it fills the tall screen instead of floating small in its middle.
    const canvas = this.renderer.domElement;
    const portrait = canvas.clientWidth < canvas.clientHeight * 0.8;
    const insets = this.insets();
    const { span, target } = portrait
      ? this.frameRects([bounds], room ? ROOM_FRAME_HEIGHT : BUILDING_FRAME_HEIGHT, direction, { ...insets, left: 0, right: 0 }, room ? PORTRAIT_ROOM_MARGIN : PORTRAIT_BUILDING_MARGIN)
      : this.frameRects([bounds], room ? ROOM_FRAME_HEIGHT : BUILDING_FRAME_HEIGHT, direction, insets, room ? 1.06 : 1.02);
    const offset = direction.multiplyScalar(HOME_OFFSET.length());
    this.moveTo(target, target.clone().add(offset), THREE.MathUtils.clamp(this.#span / span, 0.6, this.controls.maxZoom), false);
  }

  /** The view outside a building: the district the view is in, else the home frame. */
  #frameOutside() {
    const bounds = this.view.district ? this.#districts.bounds.get(this.view.district) : undefined;
    if (bounds) this.frameGround(bounds, 4);
    else this.home(false);
  }

  /** Flies to a piece of ground and frames it in the free canvas; the view direction stays (a rotation survives). */
  frameGround(bounds: Bounds, height: number) {
    const direction = (this.#tween ? this.#tween.position.clone().sub(this.#tween.target) : this.camera.position.clone().sub(this.controls.target)).normalize();
    const canvas = this.renderer.domElement;
    const portrait = canvas.clientWidth < canvas.clientHeight * 0.8;
    const insets = this.insets();
    const { span, target } = this.frameRects([bounds], height, direction, portrait ? { ...insets, left: 0, right: 0 } : insets, portrait ? 0.96 : 1.04);
    this.moveTo(target, target.clone().add(direction.multiplyScalar(HOME_OFFSET.length())), THREE.MathUtils.clamp(this.#span / span, this.controls.minZoom, this.controls.maxZoom), false);
  }

  /** Flies to the ground around a label's anchor (the jump list's town hall and post office). */
  flyToAnchor(id: string, reach = 13) {
    const anchor = this.#anchors.get(id);
    if (anchor) this.frameGround({ minX: anchor.x - reach, maxX: anchor.x + reach, minZ: anchor.z - reach * 1.4, maxZ: anchor.z + reach * 0.6 }, 5);
  }

  moveTo(target: THREE.Vector3, position: THREE.Vector3, zoom: number, immediate: boolean) {
    if (immediate || this.view.reducedMotion) {
      this.controls.target.copy(target);
      this.camera.position.copy(position);
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
      this.#tween = null;
    } else this.#tween = { position, target, zoom };
    this.invalidate();
  }

  cameraAction(action: CameraAction) {
    if (action === "home") {
      if (this.view.entered) this.frameBuilding(this.view.entered, this.view.zoomed);
      else this.#frameOutside();
      return;
    }
    const target = this.controls.target.clone(),
      position = this.camera.position.clone();
    let zoom = this.#tween?.zoom ?? this.camera.zoom;
    if (action === "rotate-left" || action === "rotate-right") {
      const offset = position.clone().sub(target).applyAxisAngle(UP, action === "rotate-left" ? Math.PI / 2 : -Math.PI / 2);
      position.copy(target).add(offset);
    }
    this.#atHome = false;
    if (action === "zoom-in") zoom = Math.min(this.controls.maxZoom, zoom * 1.25);
    if (action === "zoom-out") zoom = Math.max(this.controls.minZoom, zoom / 1.25);
    this.moveTo(target, position, zoom, false);
  }

  cancelTween = () => {
    this.#tween = null;
  };
  #leftHome = () => {
    this.#atHome = false;
  };

  #setPointer(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.#pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, (-(event.clientY - rect.top) / rect.height) * 2 + 1);
    this.#ray.setFromCamera(this.#pointer, this.camera);
    this.#hitList.length = 0;
  }
  plotAt(event: PointerEvent): number | null {
    this.#setPointer(event);
    this.#ray.intersectObject(this.#hits, true, this.#hitList);
    const plot = this.#hitList[0]?.object.userData.plot as number | undefined;
    return plot !== undefined && plot < this.view.model.buildings.length ? plot : null;
  }
  /** Inside the entered building: the agent, object or room under the pointer. */
  pickAt(event: PointerEvent): Pick | null {
    const view = this.view.entered ? this.#buildings.get(this.view.entered) : undefined;
    if (!view) return null;
    this.#setPointer(event);
    this.#ray.intersectObjects(view.pickables(), true, this.#hitList);
    for (const hit of this.#hitList) {
      if (!hit.object.visible) continue;
      const found = view.resolve(hit);
      if (found) return found;
    }
    return null;
  }
  /** Build mode inside the entered building. */
  get #building(): boolean {
    return !!this.view.entered && !!this.view.town?.build?.on;
  }
  /** The room cell of the entered building under the pointer. */
  buildCellAt(event: PointerEvent): { room: RoomKind; cell: { x: number; z: number } } | null {
    const view = this.view.entered ? this.#buildings.get(this.view.entered) : undefined;
    if (!view) return null;
    this.#setPointer(event);
    return this.#ray.ray.intersectPlane(this.#floor, this.#floorHit) ? view.cellAtWorld(this.#floorHit) : null;
  }
  pointerDown = (event: PointerEvent) => {
    this.#down = { x: event.clientX, y: event.clientY };
    if (event.button !== 0 || !this.#building) return;
    // Pressing on the selected prop drags it instead of panning the camera.
    const hit = this.pickAt(event);
    const selected = this.view.town?.build?.selected;
    if (hit?.kind === "prop" && selected && hit.id === selected) {
      this.#dragging = true;
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture?.(event.pointerId);
    }
  };
  pointerUp = (event: PointerEvent) => {
    if (this.#dragging) {
      this.#dragging = false;
      this.controls.enabled = true;
      this.callbacks.build("drop", this.buildCellAt(event), null);
      return;
    }
    if (event.button !== 0 || Math.hypot(event.clientX - this.#down.x, event.clientY - this.#down.y) > 6) return;
    if (this.#building) {
      const at = this.buildCellAt(event);
      this.callbacks.build("click", at, this.pickAt(event));
      return;
    }
    if (this.view.entered) {
      this.callbacks.pick(this.pickAt(event), false);
      return;
    }
    const plot = this.plotAt(event);
    const b = plot === null ? undefined : this.view.model.buildings[plot];
    if (b) this.callbacks.enter(b.slug);
  };
  pointerMove = (event: PointerEvent) => {
    if (this.#dragging || (!event.buttons && this.#building)) {
      const at = this.buildCellAt(event);
      const key = at ? `${at.room}:${at.cell.x},${at.cell.z}` : "";
      if (key !== this.#buildCell) {
        this.#buildCell = key;
        this.callbacks.build(this.#dragging ? "drag" : "move", at, null);
      }
      if (this.#dragging) return;
    }
    if (event.buttons) return;
    if (this.view.entered) {
      // A room under the pointer is a hover target too: it reveals that room's labels.
      const target = this.pickAt(event);
      this.#buildings.get(this.view.entered)?.setHover(target?.kind === "room" ? target.room : null);
      const key = target ? JSON.stringify(target) : "";
      if (key === this.#hoverPick) return;
      this.#hoverPick = key;
      this.renderer.domElement.style.cursor = target ? "pointer" : "";
      this.callbacks.pick(target, true);
      return;
    }
    const plot = this.plotAt(event);
    if (plot === this.#hovered) return;
    this.#hovered = plot;
    this.renderer.domElement.style.cursor = plot === null ? "" : "pointer";
    this.callbacks.hover(plot);
    this.#prepareInterior();
  };
  pointerLeave = () => {
    this.renderer.domElement.style.cursor = "";
    if (this.view.entered) this.#buildings.get(this.view.entered)?.setHover(null);
    if (this.#hoverPick) {
      this.#hoverPick = "";
      this.callbacks.pick(null, true);
    }
    if (this.#hovered === null) return;
    this.#hovered = null;
    this.callbacks.hover(null);
  };

  /* ── Frame loop ────────────────────────────────────────────────────────── */

  resize = () => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    const width = parent.clientWidth,
      height = parent.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    // The home frame sets the zoom-1 frustum; every other view is a zoom of it.
    const target = this.controls.target.clone(),
      position = this.camera.position.clone();
    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(HOME_OFFSET);
    this.#span = this.#homeFrame().span;
    // Zoom is relative to the home frame: however large the town, the closest view is about one desk.
    this.controls.maxZoom = Math.max(4, this.#span / DESK_SPAN);
    this.controls.target.copy(target);
    this.camera.position.copy(position);
    const aspect = width / height;
    this.camera.left = (-this.#span * aspect) / 2;
    this.camera.right = (this.#span * aspect) / 2;
    this.camera.top = this.#span / 2;
    this.camera.bottom = -this.#span / 2;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  };
  invalidate = () => {
    this.#dirtyFrames = this.view.reducedMotion ? 2 : 45;
    if (!this.#raf && !this.#disposed && !document.hidden) this.#raf = requestAnimationFrame(this.animate);
  };
  visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.#raf);
      this.#raf = 0;
      this.#last = 0;
    } else this.invalidate();
  };
  contextLost = (event: Event) => {
    event.preventDefault();
    this.callbacks.error();
  };
  animate = (now: number) => {
    this.#raf = 0;
    if (this.#disposed || document.hidden || this.#layingOut) return;
    if (this.#warm !== "warm") {
      if (this.#warm === "cold") {
        this.#warm = "warming";
        this.renderer
          .compileAsync(this.scene, this.camera)
          .catch(() => undefined)
          .finally(() => {
            this.#warm = "warm";
            this.invalidate();
          });
      }
      return;
    }
    if (!this.view.measure && this.#last && now - this.#last < FRAME_SKIP_MS) {
      this.#raf = requestAnimationFrame(this.animate);
      return;
    }
    const started = performance.now();
    const interval = this.#last ? now - this.#last : 0;
    const dt = this.#last ? Math.min(interval / 1000, 0.05) : 0;
    this.#last = now;
    // Walks run in simulation seconds: paused with the playback, faster with it (the engine caps one tick).
    this.walks.tick(dt * Math.max(0, this.view.speed()), this.view.now());
    this.#followPostman(dt);
    if (this.#tween) {
      const alpha = this.view.reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
      this.camera.position.lerp(this.#tween.position, alpha);
      this.controls.target.lerp(this.#tween.target, alpha);
      this.camera.zoom = THREE.MathUtils.lerp(this.camera.zoom, this.#tween.zoom, alpha);
      this.camera.updateProjectionMatrix();
      if (this.camera.position.distanceTo(this.#tween.position) < 0.005 && Math.abs(this.camera.zoom - this.#tween.zoom) < 0.002) this.#tween = null;
    }
    let moving = this.walks.moving || this.view.measure;
    // Landmarks animate (the fountain) on frames drawn anyway; they never keep the loop running on their own.
    if (!this.view.reducedMotion && dt)
      for (const object of this.#landmarks.children) (object.userData.animate as ModelAnimation | undefined)?.(dt);
    // Ambient life moves with the playback: still while it is paused, and it keeps the loop going only while it runs.
    const playing = this.view.speed() > 0;
    this.#life.tick(playing ? dt : 0);
    if (playing && this.#life.active) moving = true;
    this.#see();
    for (const [slug, going] of this.#constructions) {
      // An entered building is shown whole at once.
      if (this.view.entered === slug ? going.finish() : going.tick(dt)) moving = true;
      else this.#constructions.delete(slug);
      this.#shadowSoft = true;
    }
    for (const [slug, view] of this.#buildings.entries()) {
      view.tick(dt, this.#seen.has(slug));
      if (view.animating) moving = true;
      if (this.#lift(slug, view, dt)) moving = true;
    }
    const ticked = performance.now();
    this.controls.update();
    // Keep panning inside the town.
    const b = this.view.plan.ground,
      t = this.controls.target;
    this.#v.set(THREE.MathUtils.clamp(t.x, b.minX, b.maxX), THREE.MathUtils.clamp(t.y, 0, 2), THREE.MathUtils.clamp(t.z, b.minZ, b.maxZ)).sub(t);
    this.camera.position.add(this.#v);
    t.add(this.#v);
    this.#refitShadow();
    this.placeLabels();
    // The town view's shadow casters rarely change (robots seen from the town cast none, the postman neither), so its
    // shadow map is drawn only when something changed; inside a building it follows every frame.
    this.camera.updateMatrixWorld();
    if (this.#culler?.update(this.camera, this.#sunDirection())) this.#shadowDirty = true;
    const shadows = this.renderer.shadowMap;
    shadows.autoUpdate = this.view.entered !== null;
    if (!shadows.autoUpdate) {
      const casters = this.#casterRevision();
      if (casters !== this.#shadowCasters) {
        this.#shadowCasters = casters;
        this.#shadowSoft = true;
      }
    }
    if (!shadows.autoUpdate && (this.#shadowDirty || this.#shadowSoft)) {
      const now = performance.now(),
        wait = this.#shadowDrawn + SOFT_SHADOW_MS - now;
      if (this.#shadowDirty || wait <= 0) {
        shadows.needsUpdate = true;
        this.#shadowDirty = this.#shadowSoft = false;
        this.#shadowDrawn = now;
      } else if (!this.#shadowTimer) {
        // The loop may rest before then: one frame later catches the change up.
        this.#shadowTimer = setTimeout(() => {
          this.#shadowTimer = 0;
          this.redraw();
        }, wait + 1);
      }
    }
    // World matrices for what moved only (matrixPass.ts; three's own pass is off for this scene), before the crowd
    // copies its robots' matrices.
    updateMatrices(this.scene);
    this.#crowd.begin();
    for (const [slug, view] of this.#buildings) view.crowd(this.#crowd, this.#seen.has(slug));
    this.#crowd.end();
    try {
      this.renderer.render(this.scene, this.camera);
    } catch {
      this.callbacks.error();
      return;
    }
    if (this.view.measure || this.view.fps) {
      // The first frame after a rest (the loop draws on demand) has no frame time: it was not late, nothing was drawn.
      this.#frames.push(now, this.#rested || !interval ? NaN : interval, performance.now() - started, this.walks.tickMs);
    }
    this.#rested = false;
    if (!this.#marked.dressed) this.#mark();
    if (this.#perf) {
      const total = performance.now() - started;
      if (total > 100) console.info(`[perf] slow frame: tick ${(ticked - started).toFixed(1)} ms, render ${(performance.now() - ticked).toFixed(1)} ms, programs ${this.renderer.info.programs?.length ?? 0}`);
      this.#measure(total);
    }
    this.#dirtyFrames--;
    if (!this.#raf && (this.#tween || moving || this.#dirtyFrames > 0)) this.#raf = requestAnimationFrame(this.animate);
    if (!this.#raf) this.#rested = true;
  };

  /** `performance.mark`s for the startup measurement: the first drawn frame, and the first with the town dressed. */
  #mark() {
    if (!this.#marked.first) {
      this.#marked.first = true;
      performance.mark("world:first-frame");
    }
    if (this.#dressing.group && this.view.model.buildings.length && this.#buildings.size) {
      this.#marked.dressed = true;
      performance.mark("world:town-dressed");
    }
  }

  /** Which buildings the camera sees, with a margin (a robot stepping out of the door, a building lifting). */
  #see() {
    this.camera.updateMatrixWorld();
    this.#frustum.setFromProjectionMatrix(this.#projection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    this.#seen.clear();
    for (const [slug, view] of this.#buildings) {
      const b = view.bounds(null);
      this.#box.min.set(b.minX - 1, -1, b.minZ - 1);
      this.#box.max.set(b.maxX + 1, 5, b.maxZ + 1);
      if (this.#frustum.intersectsBox(this.#box)) this.#seen.add(slug);
    }
  }

  /** A number that changes whenever a building's shadow casters seen from the town changed, or a building came or went. */
  /** Towards the shadow-casting light (the style's sun), for culling that keeps long shadows; null without one. */
  #sunDirection(): THREE.Vector3 | undefined {
    if (this.#sun?.parent !== this.scene) this.#sun = null;
    this.#sun ??= this.scene.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight && o.castShadow) ?? null;
    if (!this.#sun) return undefined;
    return this.#v2.copy(this.#sun.position).sub(this.#sun.target.position).normalize();
  }

  #casterRevision(): number {
    let revision = this.#buildings.size;
    for (const view of this.#buildings.values()) revision = (revision * 31 + view.shadowRevision) | 0;
    return revision;
  }

  /** Eases the focused or hovered building up a little and the others back down; true while one still moves. */
  #lift(slug: string, view: BuildingView, seconds: number): boolean {
    const base = (view.group.userData.baseY ??= view.group.position.y) as number;
    const goal = base + (slug === this.#lifted && !this.view.reducedMotion && !this.view.entered ? 0.3 : 0);
    const y = view.group.position.y;
    if (y === goal) return false;
    const next = this.view.reducedMotion || Math.abs(goal - y) < 0.004 ? goal : THREE.MathUtils.lerp(y, goal, 1 - Math.exp(-seconds * 10));
    view.group.position.y = next;
    this.#shadowDirty = true;
    return next !== goal;
  }

  /** The postman follows its walker and shows the letters it carries. */
  #followPostman(seconds: number) {
    const p = this.#postman;
    if (!p) return;
    const walker = this.walks.walker(p.key);
    if (!walker) return;
    const object = p.handle.object;
    object.position.set(walker.x, walker.y + 0.02, walker.z);
    object.rotation.y = walker.walking || walker.carrying ? walker.heading : 0;
    const facts = this.#postmanFacts;
    facts.agent = this.#civicRobots[0]!.agent;
    facts.walker = walker;
    facts.carrying = walker.carrying > 0;
    const state = figureState(facts, this.#postmanFigure);
    // Between rounds it idles at the post office, whatever its lane says.
    if (!walker.walking) state.activity = "idle";
    const key = `${state.activity}${state.carrying}`;
    p.handle.setState(state);
    if (key !== this.#postmanState) {
      // A new state re-skins the figure, and with that its shadows.
      this.#postmanState = key;
      this.#unshadowPostman();
    }
    p.letters.forEach((letter, i) => (letter.visible = i < walker.carrying));
    if (!this.view.reducedMotion && walker.walking) p.handle.update(seconds);
  }
  #postmanState = "";
  #postmanFigure: FigureState = { ...IDLE_STATE };

  /** Mean, p95 and max over the last 300 drawn frames (the stress overlay; kept with `measure` or `fps`). */
  frameStats(): FrameStats {
    const s = this.#frames.stats(performance.now(), Infinity, FRAME_WINDOW);
    return {
      frames: s.frames,
      mean: s.frameMean,
      p95: s.frameP95,
      max: s.frameMax,
      workMean: s.workMean,
      workP95: s.workP95,
      tickMean: s.tickMean,
      tickMax: s.tickMax,
      calls: this.renderer.info.render.calls,
      walkers: [...this.walks.walkers()].length,
    };
  }

  /** The frame rate overlay's numbers: frames over the last two seconds (or `windowMs`; the ring holds 2048 frames),
      the last frame's draw calls, memory. */
  perf(windowMs = PERF_WINDOW_MS): WorldPerf {
    const now = performance.now();
    const s = this.#frames.stats(now, windowMs);
    const { render, memory } = this.renderer.info;
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
    return {
      fps: s.idle ? 0 : s.fps,
      idle: s.idle,
      frameMean: s.frameMean,
      frameP95: s.frameP95,
      frameMax: s.frameMax,
      slow: s.slow,
      workMean: s.workMean,
      workP95: s.workP95,
      calls: render.calls,
      triangles: render.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
      heap,
      quality: this.view.quality,
      cast: ((this.view.entered && this.#buildings.get(this.view.entered)?.ctx.cast) || this.#townCast()).manifest.name,
      view: this.view.entered ?? "town",
      frames: s.frames,
      at: now,
    };
  }

  /** `?perf`: frame work time (update + render), logged every two seconds. */
  #measure(ms: number) {
    const p = this.#perf!;
    p.frames++;
    p.total += ms;
    p.worst = Math.max(p.worst, ms);
    const now = performance.now();
    if (now - p.since < 2000) return;
    console.info(`[perf] ${p.frames} frames, mean ${(p.total / p.frames).toFixed(2)} ms, worst ${p.worst.toFixed(2)} ms, calls ${this.renderer.info.render.calls}`);
    p.frames = 0;
    p.total = 0;
    p.worst = 0;
    p.since = now;
  }

  placeLabels() {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    const stacks = this.#stacks,
      signs = this.#signs;
    stacks.length = 0;
    signs.length = 0;
    const robots = this.#robotsOnScreen(width, height);
    // From far a region shows its districts, nearer its buildings' signs (wayfinding.ts); the CSS follows `data-detail`.
    const districts = this.view.districts?.length ?? 0;
    const detail = this.view.entered ? "close" : labelDetail((height * this.camera.zoom) / (this.camera.top - this.camera.bottom), districts > 1, this.#detail);
    if (detail !== this.#detail) {
      this.#detail = detail;
      this.#labelsHost.dataset.detail = detail;
      // What a label holds changed with it: measure again.
      this.refreshLabels();
    }
    if (districts > 1 && !this.view.entered) this.#districts.place(this.#anchors, this.camera);
    for (const label of this.#labels) {
      const anchor = this.#anchors.get(label.id);
      let visible = false,
        x = 0,
        y = 0;
      if (anchor) {
        this.#v.copy(anchor).project(this.camera);
        x = (this.#v.x * 0.5 + 0.5) * width;
        y = (-this.#v.y * 0.5 + 0.5) * height;
        visible = this.#v.z > -1 && this.#v.z < 1 && x > 8 && x < width - 8 && y > 8 && y < height - 8;
        if (label.half * 2 + 16 < width) x = THREE.MathUtils.clamp(x, label.half + 8, width - label.half - 8);
      }
      label.nx = x;
      label.ny = y;
      label.ay = y;
      label.visible = visible;
      if (visible && label.stack) stacks.push(label);
      if (visible && label.sign) signs.push(label);
    }
    if (stacks.length > 1 || (stacks.length && (signs.length || robots))) nudgeStacks(stacks, signs, this.#robotBoxes, robots);
    const hideBeyond = width < NARROW_CANVAS ? FAR_LABEL : HIDDEN_LABEL;
    for (const label of this.#labels) {
      const x = label.nx,
        y = label.ny,
        visible = label.visible && !(label.stack && !label.picked && label.ay - y > hideBeyond);
      // Quiet when many: a label pushed far from its anchor fades; a room sign over a robot or its stack steps back.
      const far = visible && label.stack && !label.picked && label.ay - y > FAR_LABEL;
      if (far !== label.far) label.el.classList.toggle("label-far", (label.far = far));
      const yields = visible && label.sign && overRobot(label, stacks, this.#robotBoxes, robots);
      if (yields !== label.yields) label.el.classList.toggle("label-yield", (label.yields = yields));
      // The applied visibility is kept on the label: reading the element's style every frame cost more than the rest.
      if (visible !== label.shown) {
        label.el.style.visibility = visible ? "visible" : "hidden";
        label.shown = visible;
      }
      if (visible && (Math.abs(label.x - x) > 0.2 || Math.abs(label.y - y) > 0.2 || Number.isNaN(label.x))) {
        label.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        label.x = x;
        label.y = y;
      }
    }
  }

  /** The entered building's robots as screen boxes (head to feet), from their label anchors; none in the town. */
  #robotsOnScreen(width: number, height: number): number {
    const view = this.view.entered ? this.#buildings.get(this.view.entered) : undefined;
    if (!view) return 0;
    const pixels = (height * this.camera.zoom) / (this.camera.top - this.camera.bottom);
    const figure = view.figureBox;
    const half = (figure ? figure.half * FIGURE_HALF_WIDTH : ROBOT_HALF_WIDTH) * pixels;
    const body = figure ? figure.height : ROBOT_BODY;
    let n = 0;
    for (const [id, anchor] of view.anchors) {
      if (id.charCodeAt(0) !== 97 || id.charCodeAt(1) !== 58) continue; // "a:"
      this.#v.copy(anchor).project(this.camera);
      if (this.#v.z < -1 || this.#v.z > 1) continue;
      const x = (this.#v.x * 0.5 + 0.5) * width,
        top = (-this.#v.y * 0.5 + 0.5) * height;
      this.#v.set(anchor.x, anchor.y - body, anchor.z).project(this.camera);
      const bottom = (-this.#v.y * 0.5 + 0.5) * height;
      if (x < -half || x > width + half || bottom < 0 || top > height) continue;
      const box = (this.#robotBoxes[n] ??= { id: "", x: 0, left: 0, right: 0, top: 0, bottom: 0 });
      box.id = id;
      box.x = x;
      box.left = x - half;
      box.right = x + half;
      box.top = top;
      box.bottom = bottom;
      n++;
    }
    return n;
  }

  dispose() {
    this.#disposed = true;
    if (this.#layoutTimer) clearTimeout(this.#layoutTimer);
    this.#cancelPrepare?.();
    this.#stopIntents();
    cancelAnimationFrame(this.#raf);
    for (const going of this.#constructions.values()) going.finish();
    this.#constructions.clear();
    this.#resize.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.controls.removeEventListener("start", this.cancelTween);
    this.controls.removeEventListener("start", this.#leftHome);
    this.controls.removeEventListener("change", this.invalidate);
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.pointerDown);
    canvas.removeEventListener("pointerup", this.pointerUp);
    canvas.removeEventListener("pointermove", this.pointerMove);
    canvas.removeEventListener("pointerleave", this.pointerLeave);
    canvas.removeEventListener("webglcontextlost", this.contextLost);
    for (const view of this.#buildings.values()) view.dispose();
    for (const robot of this.#civicRobots) robot.handle.dispose();
    this.#crowd.dispose();
    this.#disposeDressing();
    clearInterval(this.#driftTimer);
    clearTimeout(this.#shadowTimer);
    this.#life.dispose();
    this.#environment.dispose();
    // Styles live in the registry (one instance per id) and outlast this scene; the renderer frees the GPU side.
    this.renderer.dispose();
    canvas.remove();
  }
}
