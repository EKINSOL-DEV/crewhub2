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
import type { AgentPlacement, RoomKind, WorldModel } from "@crewhub/world-model";
import type { EnvironmentHandle, ResolvedStyle, RobotHandle, RobotPosture, StyleTheme } from "@crewhub/world-style";
import { BuildingView, type Pick } from "./buildingView";
import type { TownLayer } from "./propLayer";
import { styleRegistry } from "./style";
import type { StyledPlot } from "./styleRegistry";
import type { Ambient } from "./movement";
import { CIVIC_LOT, civicCenter, homeRects, PLOT_SIZE, plotCenter, TOWN_CAPACITY, townBounds, type Bounds } from "./townLayout";
import { onPlayIntent } from "./intentPlayer";
import { Walks } from "./walks";

export interface TownView {
  model: WorldModel;
  /** Slug of the building whose interior is shown, or null for the town overview. */
  entered: string | null;
  /** Index of the plot with the keyboard focus ring. */
  focused: number;
  ringVisible: boolean;
  /** Inside a building: the room with the keyboard focus ring, and the room the camera frames. */
  room: RoomKind | null;
  zoomed: RoomKind | null;
  reducedMotion: boolean;
  /** The resolved UI theme: light is day, dark is lamplight. */
  theme: StyleTheme;
  /** Source time now (ms): drone flights run on it, so they follow the playback speed. */
  now: () => number;
  /** The town document and build mode's ghost and selection (applied to the entered building only). */
  town: TownLayer | null;
  /** Playback speed (0 is paused): walks run at it, capped by the engine's tick. */
  speed: () => number;
  /** Idle variety: off, reduced or on (Settings). */
  ambient: Ambient;
  /** The dev stress fixture: draw every frame, uncapped, and keep frame statistics. */
  measure: boolean;
}
export type BuildPointer = "move" | "click" | "drag" | "drop";

/** Frame statistics over the last `FRAME_WINDOW` drawn frames (the dev overlay). */
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
export type CameraAction = "home" | "rotate-left" | "rotate-right" | "zoom-in" | "zoom-out";
interface Callbacks {
  enter: (slug: string) => void;
  hover: (index: number | null) => void;
  /** Inside a building: a pointer over (hover) or a click on an agent, an object or a room; null clears. */
  pick: (target: Pick | null, hover: boolean) => void;
  error: () => void;
  /** Build mode: the room cell under the pointer (null off the floor) and what a click hit. */
  build: (kind: BuildPointer, at: { room: RoomKind; cell: { x: number; z: number } } | null, pick: Pick | null) => void;
}

const ROBOT_SCALE = 0.62;
const CIVIC_LAWN = CIVIC_LOT;
const HOME_OFFSET = new THREE.Vector3(1, 1.04, 1).normalize().multiplyScalar(90);
const UP = new THREE.Vector3(0, 1, 0);

export class TownScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 300);
  readonly controls: OrbitControls;
  readonly callbacks: Callbacks;
  readonly townStyle: ResolvedStyle;
  readonly walks = new Walks();
  view: TownView;
  #environment: EnvironmentHandle;
  #buildings = new Map<string, BuildingView>();
  #civic = new THREE.Group();
  #civicSignature = "";
  #civicRobots: RobotHandle[] = [];
  #postman: { handle: RobotHandle; key: string; letters: THREE.Object3D[] } | null = null;
  #frames = { interval: new Float32Array(FRAME_WINDOW), work: new Float32Array(FRAME_WINDOW), tick: new Float32Array(FRAME_WINDOW), count: 0, at: 0 };
  #hits = new THREE.Group();
  #ring: THREE.Object3D;
  #anchors = new Map<string, THREE.Vector3>();
  #labelsHost: HTMLElement;
  #labels: { el: HTMLElement; id: string; half: number; x: number; y: number; visible: boolean }[] = [];
  #span = 30;
  #raf = 0;
  #last = 0;
  #disposed = false;
  #dirtyFrames = 2;
  #down = { x: 0, y: 0 };
  #hovered: number | null = null;
  #hoverPick = "";
  #tween: { position: THREE.Vector3; target: THREE.Vector3; zoom: number } | null = null;
  #resize: ResizeObserver;
  #perf: { frames: number; total: number; worst: number; since: number } | null = null;
  // Scratch objects: the frame loop and picking allocate nothing.
  #ray = new THREE.Raycaster();
  #pointer = new THREE.Vector2();
  #v = new THREE.Vector3();
  #offset = new THREE.Vector3();
  #right = new THREE.Vector3();
  #up = new THREE.Vector3();
  #hitList: THREE.Intersection[] = [];
  #floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.19);
  #floorHit = new THREE.Vector3();
  #buildCell = "";
  #dragging = false;
  #stopIntents: () => void;

  constructor(host: HTMLElement, labels: HTMLElement, view: TownView, callbacks: Callbacks) {
    this.view = view;
    this.callbacks = callbacks;
    this.#labelsHost = labels;
    this.townStyle = styleRegistry.styleFor(null);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.debug.onShaderError = () => this.callbacks.error();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.setClearColor(0, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute(
      "aria-label",
      "The town. Arrow keys move between buildings, Enter goes inside. Inside a building arrow keys move between rooms, Enter zooms to a room, Escape goes back one level. Plus and minus zoom, brackets rotate, H returns home. T opens the text view.",
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
    this.controls.addEventListener("change", this.invalidate);
    this.#environment = this.townStyle.environment(this.scene, this.renderer, view.theme);
    const b = townBounds();
    this.#environment.setShadowReach(Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 4);
    this.#ring = this.townStyle.model("focus-ring", { size: { width: PLOT_SIZE + 0.4, height: 0, depth: PLOT_SIZE + 0.4 } });
    this.#ring.visible = false;
    this.buildGround();
    this.scene.add(this.#hits, this.#ring, this.#civic);
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
    this.sync();
    this.resize();
    this.home(true);
    this.setView(view);
  }

  /** Every style in use follows the theme: the town's (through its environment) and each building's. */
  applyTheme(theme: StyleTheme) {
    this.#environment.setTheme(theme);
    for (const view of this.#buildings.values()) if (view.ctx.style !== this.townStyle) view.ctx.style.setTheme(theme);
    this.invalidate();
  }

  /* ── The town ground and the empty lots ───────────────────────────────── */

  buildGround() {
    const style = this.townStyle;
    const b = townBounds();
    const ground = style.model("ground", { size: { width: b.maxX - b.minX, height: 0.5, depth: b.maxZ - b.minZ } });
    ground.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    this.scene.add(ground);
    // Every lot, built or empty, has a lawn; the town has room for twelve buildings.
    const hitGeometry = new THREE.BoxGeometry(PLOT_SIZE, 2, PLOT_SIZE);
    const hitMaterial = new THREE.MeshBasicMaterial();
    for (let i = 0; i < TOWN_CAPACITY; i++) {
      const p = plotCenter(i);
      const lawn = style.model("plot", { size: { width: PLOT_SIZE, height: 0.16, depth: PLOT_SIZE } });
      lawn.position.set(p.x, 0, p.z);
      this.scene.add(lawn);
      const hit = new THREE.Mesh(hitGeometry, hitMaterial);
      hit.visible = false;
      hit.position.set(p.x, 1, p.z);
      hit.userData.plot = i;
      this.#hits.add(hit);
      const lamp = style.model("street-lamp");
      lamp.position.set(p.x + PLOT_SIZE / 2 + 1.2, 0.02, p.z + PLOT_SIZE / 2 + 1.2);
      this.scene.add(lamp);
    }
    for (const place of ["post-office", "town-hall"] as const) {
      const c = civicCenter(place);
      const lawn = style.model("plot", { size: { width: CIVIC_LAWN, height: 0.16, depth: CIVIC_LAWN } });
      lawn.position.set(c.x, 0, c.z);
      this.scene.add(lawn);
      const building = style.model(place);
      building.position.set(c.x, 0.17, c.z - 0.6);
      this.scene.add(building);
      const plant = style.model("planting", { seed: place.length });
      plant.position.set(c.x + (place === "post-office" ? -2.8 : 2.8), 0.17, c.z + 2.8);
      this.scene.add(plant);
    }
    const bench = style.model("furniture.bench");
    const hall = civicCenter("town-hall");
    bench.position.set(hall.x, 0.2, hall.z + 2.4);
    bench.scale.setScalar(ROBOT_SCALE);
    this.scene.add(bench);
  }

  /* ── Model → scene ────────────────────────────────────────────────────── */

  sync() {
    const model = this.view.model;
    this.walks.update(model, { entered: this.view.entered, reducedMotion: this.view.reducedMotion, ambient: this.view.ambient });
    const seen = new Set<string>();
    this.#anchors.clear();
    model.buildings.slice(0, TOWN_CAPACITY).forEach((b, index) => {
      seen.add(b.slug);
      let view = this.#buildings.get(b.slug);
      const c = plotCenter(index);
      // A plot's own style id when it has one, else the town document's default (tonight both are Greenhouse).
      const plot: StyledPlot = { styleId: this.view.town?.doc.plots.find((p) => p.slug === b.slug)?.styleId ?? this.view.town?.doc.styleId ?? null };
      const style = styleRegistry.styleFor(plot);
      if (!view || view.group.userData.index !== index || view.ctx.style !== style) {
        view?.dispose();
        if (style !== this.townStyle) style.setTheme(this.view.theme);
        view = new BuildingView(b, c, PLOT_SIZE, {
          style,
          now: () => this.view.now(),
          reducedMotion: () => this.view.reducedMotion,
          walker: (key) => this.walks.walker(key),
        });
        view.group.userData.index = index;
        this.#buildings.set(b.slug, view);
        this.scene.add(view.group);
      }
      const town = this.view.town;
      view.update(b, this.view.entered === b.slug, town && (this.view.entered === b.slug ? town : { ...town, build: null }));
      view.setFocus(this.view.entered === b.slug ? this.view.room : null);
      for (const [id, v] of view.anchors) this.#anchors.set(id, v);
      this.#anchors.set(`b:${b.slug}`, new THREE.Vector3(c.x, 0.2, c.z + PLOT_SIZE / 2));
    });
    for (const [slug, view] of this.#buildings)
      if (!seen.has(slug)) {
        view.dispose();
        this.#buildings.delete(slug);
      }
    this.syncCivic();
    this.invalidate();
  }

  /** The postman at the post office and the agents in the town hall. */
  syncCivic() {
    const model = this.view.model;
    const civic = [...model.postOffice.slice(0, 2), ...model.townHall.slice(0, 5)];
    const signature = civic.map((a) => `${a.key}:${a.posture}`).join("|") + model.freshness.stale;
    const post = civicCenter("post-office"),
      hall = civicCenter("town-hall");
    this.#anchors.set("c:post-office", new THREE.Vector3(post.x, 0.2, post.z + CIVIC_LAWN / 2));
    this.#anchors.set("c:town-hall", new THREE.Vector3(hall.x, 0.2, hall.z + CIVIC_LAWN / 2));
    if (signature === this.#civicSignature) return;
    this.#civicSignature = signature;
    for (const robot of this.#civicRobots) robot.dispose();
    this.#civicRobots = [];
    this.#postman = null;
    const place = (agent: AgentPlacement, x: number, z: number, role: "router" | "worker" | "analyst" | "design" | "lead") => {
      const robot = this.townStyle.robot({ key: agent.key, accent: null, role });
      robot.object.position.set(x, 0.2, z);
      robot.object.scale.setScalar(ROBOT_SCALE * 1.4);
      robot.setPosture(agent.posture as RobotPosture);
      this.#civic.add(robot.object);
      this.#civicRobots.push(robot);
    };
    model.postOffice.slice(0, 2).forEach((a, i) => place(a, post.x - 0.5 + i, post.z + 0.4, "router"));
    const postman = model.postOffice[0];
    const handle = postman && this.#civicRobots[0];
    if (postman && handle) {
      // The postman walks the town at the interiors' scale; the letters it carries ride in front of it.
      handle.object.scale.setScalar(ROBOT_SCALE * 1.15);
      const letters = [0, 1, 2].map((i) => {
        const letter = this.townStyle.model("letter");
        letter.position.set(0, 0.62 + i * 0.07, 0.34);
        letter.rotation.x = -0.35;
        letter.visible = false;
        handle.object.add(letter);
        return letter;
      });
      this.#postman = { handle, key: postman.key, letters };
    }
    model.townHall.slice(0, 5).forEach((a, i) => place(a, hall.x - 1.6 + i * 0.8, hall.z + 1.3, a.role));
  }

  /** Picks up the label elements React rendered; call after every render that can change them. */
  refreshLabels() {
    const previous = new Map(this.#labels.map((l) => [l.el, l]));
    this.#labels = [...this.#labelsHost.querySelectorAll<HTMLElement>("[data-anchor]")].map(
      (el) => previous.get(el) ?? { el, id: el.dataset.anchor ?? "", half: 0, x: Number.NaN, y: Number.NaN, visible: false },
    );
    for (const l of this.#labels) {
      l.id = l.el.dataset.anchor ?? "";
      l.half = ((l.el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0) / 2;
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
    if (previous.model !== view.model || previous.entered !== view.entered || previous.room !== view.room || previous.town !== view.town) this.sync();
    else if (previous.reducedMotion !== view.reducedMotion || previous.ambient !== view.ambient)
      this.walks.update(view.model, { entered: view.entered, reducedMotion: view.reducedMotion, ambient: view.ambient });
    if (previous.entered !== view.entered) {
      // The overlay's window describes one view: start it again.
      this.#frames.count = 0;
      this.#frames.at = 0;
      if (view.entered) this.frameBuilding(view.entered, view.zoomed);
      else this.home(false);
    } else if (view.entered && previous.zoomed !== view.zoomed) this.frameBuilding(view.entered, view.zoomed);
    const index = Math.min(view.focused, TOWN_CAPACITY - 1);
    const p = plotCenter(index);
    this.#ring.position.set(p.x, 0.2, p.z);
    this.#ring.visible = view.ringVisible && !view.entered && index < view.model.buildings.length;
    this.refreshLabels();
  }

  /** The frustum height (at zoom 1) that frames `bounds` from the current camera direction. */
  spanFor(bounds: Bounds, height: number): number {
    return this.frameRects([bounds], height, this.#v.copy(this.camera.position).sub(this.controls.target)).span;
  }

  /**
   * Frames the projected corners of `rects` (each up to `height`) seen along `direction` (camera minus target): the
   * frustum height at zoom 1 and the ground point to aim at so they sit centred on the screen.
   */
  frameRects(rects: readonly Bounds[], height: number, direction: THREE.Vector3): { span: number; target: THREE.Vector3 } {
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
    const uc = (u0 + u1) / 2,
      vc = (v0 + v1) / 2;
    // The screen centre (uc, vc), slid along the view direction down to the ground.
    const target = this.#right.clone().multiplyScalar(uc).addScaledVector(this.#up, vc);
    target.addScaledVector(this.#offset, -target.y / this.#offset.y);
    const canvas = this.renderer.domElement;
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight) || 1;
    return { span: Math.max(v1 - v0, (u1 - u0) / aspect) * 1.04, target };
  }

  home(immediate: boolean) {
    const { target } = this.frameRects(homeRects(this.view.model.buildings.length), 2, HOME_OFFSET);
    this.moveTo(target, target.clone().add(HOME_OFFSET), 1, immediate);
  }

  /** Frames the entered building, or one of its rooms. */
  frameBuilding(slug: string, room: RoomKind | null) {
    const view = this.#buildings.get(slug);
    if (!view) return;
    const bounds = view.bounds(room);
    const offset = this.camera.position.clone().sub(this.controls.target);
    const target = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0.4, (bounds.minZ + bounds.maxZ) / 2);
    const span = this.spanFor(bounds, room ? 1.2 : 2);
    this.moveTo(target, target.clone().add(offset), THREE.MathUtils.clamp(this.#span / span, 0.6, this.controls.maxZoom), false);
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
      else this.home(false);
      return;
    }
    const target = this.controls.target.clone(),
      position = this.camera.position.clone();
    let zoom = this.#tween?.zoom ?? this.camera.zoom;
    if (action === "rotate-left" || action === "rotate-right") {
      const offset = position.clone().sub(target).applyAxisAngle(UP, action === "rotate-left" ? Math.PI / 2 : -Math.PI / 2);
      position.copy(target).add(offset);
    }
    if (action === "zoom-in") zoom = Math.min(this.controls.maxZoom, zoom * 1.25);
    if (action === "zoom-out") zoom = Math.max(this.controls.minZoom, zoom / 1.25);
    this.moveTo(target, position, zoom, false);
  }

  cancelTween = () => {
    this.#tween = null;
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
      const found = this.pickAt(event);
      const target = found && found.kind !== "room" ? found : null;
      const key = target ? JSON.stringify(target) : "";
      if (key === this.#hoverPick) return;
      this.#hoverPick = key;
      this.renderer.domElement.style.cursor = found ? "pointer" : "";
      this.callbacks.pick(target, true);
      return;
    }
    const plot = this.plotAt(event);
    if (plot === this.#hovered) return;
    this.#hovered = plot;
    this.renderer.domElement.style.cursor = plot === null ? "" : "pointer";
    this.callbacks.hover(plot);
  };
  pointerLeave = () => {
    this.renderer.domElement.style.cursor = "";
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
    this.#span = this.frameRects(homeRects(this.view.model.buildings.length), 2, HOME_OFFSET).span;
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
    if (this.#disposed || document.hidden) return;
    if (!this.view.measure && this.#last && now - this.#last < 1000 / 30 - 0.5) {
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
    for (const view of this.#buildings.values()) {
      view.tick(dt);
      if (view.animating) moving = true;
    }
    const ticked = performance.now();
    this.controls.update();
    // Keep panning inside the town.
    const b = townBounds(),
      t = this.controls.target;
    this.#v.set(THREE.MathUtils.clamp(t.x, b.minX, b.maxX), THREE.MathUtils.clamp(t.y, 0, 2), THREE.MathUtils.clamp(t.z, b.minZ, b.maxZ)).sub(t);
    this.camera.position.add(this.#v);
    t.add(this.#v);
    this.placeLabels();
    try {
      this.renderer.render(this.scene, this.camera);
    } catch {
      this.callbacks.error();
      return;
    }
    if (this.view.measure && interval) this.#record(interval, performance.now() - started, this.walks.tickMs);
    if (this.#perf) {
      const total = performance.now() - started;
      if (total > 100) console.info(`[perf] slow frame: tick ${(ticked - started).toFixed(1)} ms, render ${(performance.now() - ticked).toFixed(1)} ms, programs ${this.renderer.info.programs?.length ?? 0}`);
      this.#measure(total);
    }
    this.#dirtyFrames--;
    if (!this.#raf && (this.#tween || moving || this.#dirtyFrames > 0)) this.#raf = requestAnimationFrame(this.animate);
  };

  /** The postman follows its walker and shows the letters it carries. */
  #followPostman(seconds: number) {
    const p = this.#postman;
    if (!p) return;
    const walker = this.walks.walker(p.key);
    if (!walker) return;
    const object = p.handle.object;
    object.position.set(walker.x, walker.y + 0.02, walker.z);
    object.rotation.y = walker.walking || walker.carrying ? walker.heading : 0;
    p.handle.setPosture(walker.walking ? "walking" : "relaxed");
    p.letters.forEach((letter, i) => (letter.visible = i < walker.carrying));
    if (!this.view.reducedMotion && walker.walking) p.handle.update(seconds);
  }

  #record(interval: number, work: number, tick: number) {
    const f = this.#frames;
    f.interval[f.at] = interval;
    f.work[f.at] = work;
    f.tick[f.at] = tick;
    f.at = (f.at + 1) % FRAME_WINDOW;
    f.count = Math.min(FRAME_WINDOW, f.count + 1);
  }

  /** Mean, p95 and max over the last 300 drawn frames (the dev overlay; `measure` only). */
  frameStats(): FrameStats {
    const f = this.#frames;
    const n = f.count;
    const stat = (a: Float32Array) => {
      const v = Array.from(a.subarray(0, n)).sort((x, y) => x - y);
      return { mean: v.reduce((s, x) => s + x, 0) / Math.max(1, n), p95: v[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0, max: v[n - 1] ?? 0 };
    };
    const interval = stat(f.interval),
      work = stat(f.work),
      tick = stat(f.tick);
    return {
      frames: n,
      mean: interval.mean,
      p95: interval.p95,
      max: interval.max,
      workMean: work.mean,
      workP95: work.p95,
      tickMean: tick.mean,
      tickMax: tick.max,
      calls: this.renderer.info.render.calls,
      walkers: [...this.walks.walkers()].length,
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
      if (Math.abs(label.x - x) > 0.2 || Math.abs(label.y - y) > 0.2 || label.visible !== visible || Number.isNaN(label.x)) {
        label.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        label.el.style.visibility = visible ? "visible" : "hidden";
        label.x = x;
        label.y = y;
        label.visible = visible;
      }
    }
  }

  dispose() {
    this.#disposed = true;
    this.#stopIntents();
    cancelAnimationFrame(this.#raf);
    this.#resize.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.controls.removeEventListener("start", this.cancelTween);
    this.controls.removeEventListener("change", this.invalidate);
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.pointerDown);
    canvas.removeEventListener("pointerup", this.pointerUp);
    canvas.removeEventListener("pointermove", this.pointerMove);
    canvas.removeEventListener("pointerleave", this.pointerLeave);
    canvas.removeEventListener("webglcontextlost", this.contextLost);
    for (const view of this.#buildings.values()) view.dispose();
    for (const robot of this.#civicRobots) robot.dispose();
    this.#environment.dispose();
    // Styles live in the registry (one instance per id) and outlast this scene; the renderer frees the GPU side.
    this.renderer.dispose();
    canvas.remove();
  }
}
