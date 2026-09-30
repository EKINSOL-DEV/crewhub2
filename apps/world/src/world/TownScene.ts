/* The town: one plot per building in `model.buildings` order, a post office and a town hall, drawn with the
   Greenhouse's materials, lighting and soft robots. It reads the WorldModel contract only. Labels are HTML (rendered
   by WorldCanvas); this class positions every `[data-anchor]` element over its anchor each drawn frame. It renders on
   demand: a frame is drawn only after a change, a camera move or during a tween. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { AgentPlacement, Building, ProjectColor, ProjectIcon, WorldModel } from "@crewhub/world-model";
import { Assets, botModel, disposeExtraMaterials, propModel, type BotModel } from "./models";
import { palette } from "./data";
import { floorMaterial, glassMaterial } from "./shaders";
import { civicCenter, PLOT_SIZE, plotCenter, TOWN_CAPACITY, townBounds, usedBounds, type Bounds } from "./townLayout";

export interface TownView {
  model: WorldModel;
  /** Slug of the building whose interior is shown, or null for the town overview. */
  entered: string | null;
  /** Index of the plot with the keyboard focus ring. */
  focused: number;
  ringVisible: boolean;
  reducedMotion: boolean;
}
export type CameraAction = "home" | "rotate-left" | "rotate-right" | "zoom-in" | "zoom-out";
interface Callbacks {
  enter: (slug: string) => void;
  hover: (index: number | null) => void;
  error: () => void;
}

/** Interior furniture and robots are Greenhouse-sized; a building shows them at this scale. */
const INTERIOR = 0.62;
const HALF = 2.5; // half the building's side
const TALL = 1.35; // back and left walls; the front and right walls are cut low, like an architectural model
const LOW = 0.45;
const THICK = 0.14;
const DOOR = 1.3;
/** Desk spots around the lead's centre desk: [x, z] of the desk, the robot stands just south of it. */
const SPOTS: readonly (readonly [number, number])[] = [
  [-1.55, -1.35],
  [1.55, -1.35],
  [-1.55, 0.05],
  [1.55, 0.05],
  [-1.55, 1.35],
  [1.55, 1.35],
];
const LEAD_DESK: readonly [number, number] = [0, -0.75];
const PROJECT_COLORS: readonly ProjectColor[] = ["coral", "tangerine", "circle", "mist", "ink"];
const HOME_OFFSET = new THREE.Vector3(1, 1.04, 1).normalize().multiplyScalar(60);
const UP = new THREE.Vector3(0, 1, 0);

interface Plot {
  group: THREE.Group;
  detail: THREE.Group;
  signature: string;
}

export class TownScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 200);
  readonly assets = new Assets();
  readonly controls: OrbitControls;
  readonly callbacks: Callbacks;
  view: TownView;
  #colors = new Map<ProjectColor, string>();
  #plots = new Map<string, Plot>();
  #civic: Plot | null = null;
  #hits = new THREE.Group();
  #ring: THREE.Mesh;
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
  #tween: { position: THREE.Vector3; target: THREE.Vector3; zoom: number } | null = null;
  #resize: ResizeObserver;
  #themeWatch: MutationObserver;
  #schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  // Scratch objects: the frame loop and picking allocate nothing.
  #ray = new THREE.Raycaster();
  #pointer = new THREE.Vector2();
  #v = new THREE.Vector3();
  #offset = new THREE.Vector3();
  #right = new THREE.Vector3();
  #up = new THREE.Vector3();
  #hitList: THREE.Intersection[] = [];

  constructor(host: HTMLElement, labels: HTMLElement, view: TownView, callbacks: Callbacks) {
    this.view = view;
    this.callbacks = callbacks;
    this.#labelsHost = labels;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.debug.onShaderError = () => this.callbacks.error();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.setClearColor(0, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute(
      "aria-label",
      "The town. Arrow keys move between buildings, Enter goes inside, Escape or Backspace returns to the town. Plus and minus zoom, brackets rotate, H returns home. T opens the text view.",
    );
    host.appendChild(canvas);
    this.camera.position.copy(HOME_OFFSET);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = !view.reducedMotion;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = false;
    this.controls.minZoom = 0.6;
    this.controls.maxZoom = 7;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.2;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.addEventListener("start", this.cancelTween);
    this.controls.addEventListener("change", this.invalidate);
    this.#ring = new THREE.Mesh(
      new THREE.RingGeometry(PLOT_SIZE * 0.66, PLOT_SIZE * 0.72, 4, 1, Math.PI / 4),
      new THREE.MeshBasicMaterial({ color: palette.focusRing, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.#ring.rotation.x = -Math.PI / 2;
    this.#ring.visible = false;
    this.readColors();
    this.buildGround();
    this.scene.add(this.#hits, this.#ring);
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerleave", this.pointerLeave);
    canvas.addEventListener("webglcontextlost", this.contextLost);
    document.addEventListener("visibilitychange", this.visibility);
    this.#themeWatch = new MutationObserver(this.themeChanged);
    this.#themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    this.#schemeQuery.addEventListener("change", this.themeChanged);
    this.#resize = new ResizeObserver(this.resize);
    this.#resize.observe(host);
    this.sync();
    this.resize();
    this.home(true);
    this.setView(view);
  }

  /* ── Colours ─────────────────────────────────────────────────────────── */

  /** Project colours are the design tokens (`--coral` …, hex in tokens.css), read at runtime so no hex enters here. */
  readColors(): boolean {
    const style = getComputedStyle(document.documentElement);
    let changed = false;
    for (const name of PROJECT_COLORS) {
      const value = style.getPropertyValue(`--${name}`).trim() || palette.noProjectColor;
      if (this.#colors.get(name) !== value) changed = true;
      this.#colors.set(name, value);
    }
    return changed;
  }
  colorOf(color: ProjectColor | null): string {
    return (color && this.#colors.get(color)) || palette.noProjectColor;
  }
  themeChanged = () => {
    if (!this.readColors()) return;
    for (const plot of this.#plots.values()) plot.signature = "";
    this.sync();
  };

  /* ── The town ground, lights and the empty lots ───────────────────────── */

  buildGround() {
    const a = this.assets;
    this.scene.add(new THREE.HemisphereLight(palette.hemisphereSky, palette.hemisphereGround, 2.2));
    const sun = new THREE.DirectionalLight(palette.sun, 3.3);
    sun.position.set(-12, 30, -18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const b = townBounds();
    const reach = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 4;
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, far: 90 });
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.0001;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(palette.fill, 0.8);
    fill.position.set(18, 15, 21);
    this.scene.add(fill);
    const w = b.maxX - b.minX,
      d = b.maxZ - b.minZ,
      cx = (b.minX + b.maxX) / 2,
      cz = (b.minZ + b.maxZ) / 2;
    const plinth = a.box(w + 0.6, 0.5, d + 0.6, palette.plinth, 0.2);
    plinth.position.set(cx, -0.3, cz);
    this.scene.add(plinth);
    const street = a.box(w, 0.1, d, palette.street, 0.04);
    street.position.set(cx, -0.03, cz);
    this.scene.add(street);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.15 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.56;
    shadow.receiveShadow = true;
    this.scene.add(shadow);
    // Every lot, built or empty, has a lawn; the town has room for twelve buildings.
    const hitGeometry = a.geometry("hit", () => new THREE.BoxGeometry(PLOT_SIZE, 2, PLOT_SIZE));
    const hitMaterial = new THREE.MeshBasicMaterial();
    for (let i = 0; i < TOWN_CAPACITY; i++) {
      const p = plotCenter(i);
      this.lawn(this.scene, p.x, p.z, PLOT_SIZE);
      const hit = new THREE.Mesh(hitGeometry, hitMaterial);
      hit.visible = false;
      hit.position.set(p.x, 1, p.z);
      hit.userData.plot = i;
      this.#hits.add(hit);
    }
    // Street furniture from the Greenhouse props: lamps at the crossings, planted corners.
    const grid = { width: 1, depth: 1, cellSize: 0.6 };
    for (let i = 0; i < TOWN_CAPACITY; i++) {
      const p = plotCenter(i);
      const lamp = propModel({ id: `lamp-${i}`, definitionId: "lamp", cell: { x: 0, z: 0 }, rotation: 0 }, a, grid);
      lamp.position.set(p.x + PLOT_SIZE / 2 + 1, 0.02, p.z + PLOT_SIZE / 2 + 1);
      lamp.scale.setScalar(0.8);
      this.scene.add(lamp);
    }
  }

  lawn(parent: THREE.Object3D, x: number, z: number, size: number) {
    const edge = this.assets.box(size, 0.16, size, palette.lawnEdge, 0.06);
    edge.position.set(x, 0.06, z);
    parent.add(edge);
    const lawn = this.assets.box(size - 0.2, 0.04, size - 0.2, palette.lawn, 0.015);
    lawn.position.set(x, 0.15, z);
    parent.add(lawn);
  }

  /* ── Model → scene ────────────────────────────────────────────────────── */

  /** Rebuilds only the plots whose drawn facts changed. */
  sync() {
    const model = this.view.model;
    const seen = new Set<string>();
    this.#anchors.clear();
    model.buildings.slice(0, TOWN_CAPACITY).forEach((b, index) => {
      seen.add(b.slug);
      const signature = this.signature(b, index);
      let plot = this.#plots.get(b.slug);
      if (!plot || plot.signature !== signature) {
        if (plot) this.disposeGroup(plot.group);
        plot = this.buildBuilding(b, index, signature);
        this.#plots.set(b.slug, plot);
        this.scene.add(plot.group);
      }
      this.addBuildingAnchors(b, index);
    });
    for (const [slug, plot] of this.#plots)
      if (!seen.has(slug)) {
        this.disposeGroup(plot.group);
        this.#plots.delete(slug);
      }
    const civicSignature = [...model.townHall, ...model.postOffice].map((a) => `${a.key}:${a.laneStatus}`).join("|");
    if (!this.#civic || this.#civic.signature !== civicSignature) {
      if (this.#civic) this.disposeGroup(this.#civic.group);
      this.#civic = this.buildCivic(civicSignature);
      this.scene.add(this.#civic.group);
    }
    this.addCivicAnchors();
    this.applyEntered();
    this.invalidate();
  }

  signature(b: Building, index: number): string {
    const agents = b.agents.map((a) => `${a.key}:${a.presence}:${a.laneStatus}`).join(",");
    return `${index}|${b.archived}|${this.colorOf(b.color)}|${b.icon}|${b.lead.id}|${agents}`;
  }

  disposeGroup(group: THREE.Group) {
    group.removeFromParent();
    disposeExtraMaterials(group, this.assets);
  }

  buildBuilding(b: Building, index: number, signature: string): Plot {
    const a = this.assets;
    const group = new THREE.Group(),
      detail = new THREE.Group();
    const { x, z } = plotCenter(index);
    group.position.set(x, 0.17, z);
    const color = this.colorOf(b.color);
    // Floor: the Greenhouse floor shader, a warm tiled studio floor.
    const floor = floorMaterial(8, 8);
    const surface = new THREE.Mesh(a.geometry("floor", () => new THREE.PlaneGeometry(HALF * 2, HALF * 2)), floor.material);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = 0.035;
    surface.receiveShadow = true;
    group.add(surface);
    const wall = b.archived ? palette.chalkDim : palette.chalk;
    // Back wall: framed glass between chalk piers, as the Greenhouse's glass wall.
    this.wallRun(group, "x", -HALF, TALL, wall, color, b.archived ? null : 4);
    this.wallRun(group, "z", -HALF, TALL, wall, color, null);
    this.wallRun(group, "z", HALF, LOW, wall, color, null);
    // Front wall with a door in the middle.
    const side = (HALF * 2 - DOOR) / 2;
    for (const s of [-1, 1]) {
      const piece = a.box(side, LOW, THICK, wall, 0.03);
      piece.position.set(s * (DOOR / 2 + side / 2), LOW / 2, HALF);
      group.add(piece);
      const trim = a.box(side + 0.02, 0.07, THICK + 0.06, color, 0.02);
      trim.position.set(s * (DOOR / 2 + side / 2), LOW + 0.035, HALF);
      group.add(trim);
    }
    const step = a.box(DOOR + 0.3, 0.06, 0.5, palette.step, 0.02);
    step.position.set(0, 0.03, HALF + 0.35);
    group.add(step);
    if (b.archived) {
      // Boarded up: planks across the door.
      for (const [y, tilt] of [
        [0.18, 0.18],
        [0.36, -0.14],
      ] as const) {
        const plank = a.box(DOOR + 0.2, 0.09, 0.05, palette.plank, 0.015);
        plank.position.set(0, y, HALF + 0.1);
        plank.rotation.z = tilt;
        group.add(plank);
      }
    }
    this.flag(group, color, b.archived);
    this.emblem(group, b.icon, color);
    if (!b.archived) {
      // Pendant lamp over the lead's desk and a rug, as in the Greenhouse.
      const rug = a.box(2.2, 0.012, 1.5, palette.rug, 0.05);
      rug.position.set(0, 0.045, 0.2);
      group.add(rug);
      this.desk(group, LEAD_DESK[0], LEAD_DESK[1], `lead-${b.slug}`);
      const lead = b.agents.find((ag) => ag.key === b.lead.id && ag.presence === "real");
      if (lead) this.bot(group, lead, color, LEAD_DESK[0], LEAD_DESK[1] + 0.62, 0);
      const plant = propModel({ id: `plant-${b.slug}`, definitionId: "plant", cell: { x: 0, z: 0 }, rotation: 0 }, a, { width: 1, depth: 1, cellSize: 0.6 });
      plant.position.set(-HALF + 0.4, 0.03, -HALF + 0.4);
      plant.scale.setScalar(INTERIOR);
      group.add(plant);
      // The other agents at their desks, shown inside the entered building only.
      const others = b.agents.filter((ag) => ag.key !== b.lead.id);
      others.slice(0, SPOTS.length).forEach((ag, i) => {
        const [dx, dz] = SPOTS[i]!;
        this.desk(detail, dx, dz, `desk-${b.slug}-${i}`);
        this.bot(detail, ag, palette.bots[i % palette.bots.length]!, dx, dz + 0.62, i + 1);
      });
      group.add(detail);
    }
    return { group, detail, signature };
  }

  /** A straight wall along `axis` at `at`, with a ledge, a skirt and the facade trim on top. */
  wallRun(group: THREE.Group, axis: "x" | "z", at: number, height: number, wall: string, trimColor: string, panes: number | null) {
    const a = this.assets;
    const along = HALF * 2 + THICK;
    const place = (mesh: THREE.Object3D, offset: number, y: number) => {
      if (axis === "x") mesh.position.set(offset, y, at);
      else mesh.position.set(at, y, offset);
      mesh.rotation.y = axis === "x" ? 0 : Math.PI / 2;
      group.add(mesh);
    };
    if (panes) {
      const glass = glassMaterial();
      glass.uniforms.uOpacity!.value = 0.32;
      const pane = a.geometry(`pane:${panes}`, () => new THREE.PlaneGeometry(along / panes - 0.08, height - 0.2));
      for (let i = 0; i < panes; i++) {
        const offset = -along / 2 + ((i + 0.5) * along) / panes;
        place(new THREE.Mesh(pane, glass), offset, height / 2);
        place(a.box(0.05, height, 0.08, palette.mullion, 0.01), offset - along / panes / 2, height / 2);
      }
      place(a.box(0.05, height, 0.08, palette.mullion, 0.01), along / 2, height / 2);
      place(a.box(along, 0.1, 0.12, palette.mullion, 0.02), 0, 0.05);
    } else {
      place(a.box(along, height, THICK, wall, 0.03), 0, height / 2);
      place(a.box(along - 0.1, 0.12, THICK + 0.04, palette.skirt, 0.02), 0, 0.08);
    }
    place(a.box(along + 0.04, 0.08, THICK + 0.08, trimColor, 0.02), 0, height + 0.04);
  }

  flag(group: THREE.Group, color: string, archived: boolean) {
    const a = this.assets;
    const pole = a.cylinder(0.03, 0.03, 2.4, palette.pole);
    pole.position.set(-HALF - 0.35, 1.2, -HALF - 0.35);
    group.add(pole);
    const cloth = a.box(0.75, 0.46, 0.03, color, 0.01);
    // An archived project's flag hangs at half-mast.
    cloth.position.set(-HALF - 0.35 + 0.39, archived ? 1.35 : 2.12, -HALF - 0.35);
    group.add(cloth);
  }

  /** The loops `icon` as a small sculpture on a plinth by the door. */
  emblem(group: THREE.Group, icon: ProjectIcon | null, color: string) {
    const a = this.assets;
    const g = new THREE.Group();
    g.position.set(HALF - 0.55, 0, HALF + 0.75);
    group.add(g);
    const plinth = a.box(0.62, 0.3, 0.62, palette.emblemPlinth, 0.05);
    plinth.position.y = 0.15;
    g.add(plinth);
    const material = a.material(color);
    const shape = (key: string, create: () => THREE.BufferGeometry, x: number, y: number, z: number) => {
      const mesh = a.mesh(a.geometry(key, create), material);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    const top = 0.3;
    switch (icon) {
      case "home": {
        put(g, a.box(0.36, 0.26, 0.36, color, 0.03), 0, top + 0.13, 0);
        shape("emblem:roof", () => new THREE.ConeGeometry(0.34, 0.24, 4, 1).rotateY(Math.PI / 4), 0, top + 0.38, 0);
        break;
      }
      case "inbox": {
        put(g, a.box(0.46, 0.06, 0.36, color, 0.02), 0, top + 0.03, 0);
        for (const [x, z, w, d] of [
          [0, -0.17, 0.46, 0.04],
          [0, 0.17, 0.46, 0.04],
          [-0.21, 0, 0.04, 0.36],
          [0.21, 0, 0.04, 0.36],
        ] as const)
          put(g, a.box(w, 0.12, d, color, 0.01), x, top + 0.09, z);
        break;
      }
      case "bot": {
        put(g, a.box(0.42, 0.32, 0.32, color, 0.08), 0, top + 0.18, 0);
        put(g, a.box(0.32, 0.13, 0.03, palette.visor, 0.04), 0, top + 0.19, 0.165);
        for (const x of [-0.07, 0.07]) put(g, a.box(0.04, 0.06, 0.02, palette.eye, 0.015), x, top + 0.19, 0.185);
        put(g, a.sphere(0.045, color), 0, top + 0.43, 0);
        break;
      }
      case "spark": {
        const spark = shape("emblem:spark", () => new THREE.OctahedronGeometry(0.2), 0, top + 0.28, 0);
        spark.scale.set(0.8, 1.5, 0.8);
        break;
      }
      case "users": {
        for (const [x, s] of [
          [-0.1, 1],
          [0.12, 0.85],
        ] as const) {
          put(g, a.cylinder(0.08 * s, 0.12 * s, 0.22 * s, color), x, top + 0.11 * s, 0);
          put(g, a.sphere(0.075 * s, color), x, top + 0.3 * s, 0);
        }
        break;
      }
      case "star": {
        const star = shape("emblem:star", starGeometry, 0, top + 0.26, 0);
        star.rotation.y = Math.PI / 5;
        break;
      }
      case "folder": {
        put(g, a.box(0.46, 0.34, 0.07, color, 0.02), 0, top + 0.17, 0);
        put(g, a.box(0.18, 0.06, 0.07, color, 0.02), -0.14, top + 0.36, 0);
        break;
      }
      default:
        break;
    }
  }

  desk(group: THREE.Group, x: number, z: number, id: string) {
    const d = propModel({ id, definitionId: "desk", cell: { x: 0, z: 0 }, rotation: 0 }, this.assets, { width: 3, depth: 2, cellSize: 0.6 });
    d.position.set(x, 0.03, z);
    d.scale.setScalar(INTERIOR);
    group.add(d);
  }

  /** A Greenhouse robot with a still pose for its lane status; a proxy is a translucent echo. */
  bot(group: THREE.Group, agent: AgentPlacement, color: string, x: number, z: number, variant: number): BotModel {
    const bot = botModel(this.assets, color, agent.key, variant % 3);
    bot.group.position.set(x, 0.03, z);
    bot.group.scale.setScalar(INTERIOR);
    bot.group.rotation.y = 0.2;
    const status = this.view.model.freshness.stale ? "unknown" : agent.laneStatus;
    if (status === "working") {
      bot.head.rotation.x = -0.12;
      bot.arms[0]!.rotation.x = -0.45;
    }
    if (status === "blocked") bot.arms[1]!.rotation.z = -2.15;
    if (status === "done") bot.arms[1]!.rotation.z = -0.55;
    if (status === "idle") bot.head.rotation.z = 0.07;
    bot.halo.uniforms.uActive!.value = status === "blocked" ? 0.65 : 0;
    if (agent.presence === "proxy" || status === "unknown") {
      const opacity = agent.presence === "proxy" ? 0.35 : 0.7;
      const clones = new Map<THREE.Material, THREE.Material>();
      bot.group.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial)) return;
        let m = clones.get(o.material);
        if (!m) {
          const c = o.material.clone();
          c.transparent = true;
          c.opacity = opacity;
          c.depthWrite = agent.presence !== "proxy";
          clones.set(o.material, c);
          m = c;
        }
        o.material = m;
        o.castShadow = agent.presence !== "proxy";
      });
    }
    group.add(bot.group);
    return bot;
  }

  buildCivic(signature: string): Plot {
    const a = this.assets;
    const group = new THREE.Group(),
      detail = new THREE.Group();
    const post = civicCenter("post-office"),
      hall = civicCenter("town-hall");
    this.lawn(group, post.x, post.z, PLOT_SIZE);
    this.lawn(group, hall.x, hall.z, PLOT_SIZE);
    // Post office: a small chalk house with a timber counter and a mailbox.
    const office = new THREE.Group();
    office.position.set(post.x, 0.17, post.z - 0.6);
    group.add(office);
    for (const [x, z, w, d, h] of [
      [0, -1.2, 3.2, THICK, TALL],
      [-1.6, 0, THICK, 2.4, TALL],
      [1.6, 0, THICK, 2.4, LOW],
    ] as const) {
      put(office, a.box(w, h, d, palette.chalk, 0.03), x, h / 2, z);
      put(office, a.box(w + 0.04, 0.08, d + 0.04, palette.ledge, 0.02), x, h + 0.04, z);
    }
    put(office, a.box(2, 0.7, 0.4, palette.timber, 0.04), 0, 0.35, 0.2);
    const box = a.box(0.4, 0.5, 0.34, palette.timber, 0.05);
    box.position.set(1.9, 0.25, 1.9);
    office.add(box);
    put(office, a.cylinder(0.05, 0.05, 0.5, palette.pole), 1.9, 0.25, 1.9);
    // Town hall: columns on a stepped base.
    const townHall = new THREE.Group();
    townHall.position.set(hall.x, 0.17, hall.z - 0.6);
    group.add(townHall);
    for (let i = 0; i < 2; i++) put(townHall, a.box(4.2 - i * 0.3, 0.12, 2.6 - i * 0.3, palette.step, 0.03), 0, 0.06 + i * 0.12, 0);
    put(townHall, a.box(3.9, TALL, THICK, palette.chalk, 0.03), 0, TALL / 2 + 0.24, -1.1);
    for (let i = 0; i < 5; i++) put(townHall, a.cylinder(0.1, 0.12, TALL, palette.chalk), -1.6 + i * 0.8, TALL / 2 + 0.24, 1);
    put(townHall, a.box(4, 0.14, 0.4, palette.ledge, 0.03), 0, TALL + 0.3, 1);
    const bench = propModel({ id: "hall-bench", definitionId: "bench", cell: { x: 0, z: 0 }, rotation: 0 }, a, { width: 3, depth: 1, cellSize: 0.6 });
    bench.position.set(hall.x, 0.2, hall.z + 2.2);
    bench.scale.setScalar(INTERIOR);
    group.add(bench);
    for (const [x, z] of [
      [post.x - 2.4, post.z + 2.4],
      [hall.x + 2.4, hall.z + 2.4],
    ] as const) {
      const plant = propModel({ id: `plant-${x}`, definitionId: "plant", cell: { x: 0, z: 0 }, rotation: 0 }, a, { width: 1, depth: 1, cellSize: 0.6 });
      plant.position.set(x, 0.17, z);
      group.add(plant);
    }
    const model = this.view.model;
    model.postOffice.slice(0, 2).forEach((ag, i) => this.bot(group, ag, palette.bots[1]!, post.x - 0.5 + i, post.z + 0.4, 2));
    model.townHall.slice(0, 5).forEach((ag, i) => this.bot(group, ag, palette.bots[i % palette.bots.length]!, hall.x - 1.6 + i * 0.8, hall.z + 1.3, i));
    return { group, detail, signature };
  }

  /* ── Label anchors ─────────────────────────────────────────────────────── */

  addBuildingAnchors(b: Building, index: number) {
    const { x, z } = plotCenter(index);
    this.#anchors.set(`b:${b.slug}`, new THREE.Vector3(x, 0.2, z + PLOT_SIZE / 2));
    if (b.archived) return;
    const lead = b.agents.find((ag) => ag.key === b.lead.id && ag.presence === "real");
    if (lead) this.#anchors.set(`a:${b.slug}:${lead.key}`, new THREE.Vector3(x + LEAD_DESK[0], 1.2, z + LEAD_DESK[1] + 0.62));
    b.agents
      .filter((ag) => ag.key !== b.lead.id)
      .slice(0, SPOTS.length)
      .forEach((ag, i) => {
        const [dx, dz] = SPOTS[i]!;
        this.#anchors.set(`a:${b.slug}:${ag.key}`, new THREE.Vector3(x + dx, 1.2, z + dz + 0.62));
      });
  }
  addCivicAnchors() {
    const post = civicCenter("post-office"),
      hall = civicCenter("town-hall");
    this.#anchors.set("c:post-office", new THREE.Vector3(post.x, 0.2, post.z + PLOT_SIZE / 2));
    this.#anchors.set("c:town-hall", new THREE.Vector3(hall.x, 0.2, hall.z + PLOT_SIZE / 2));
  }
  /** Picks up the label elements React rendered; call after every render that can change them. */
  refreshLabels() {
    const previous = new Map(this.#labels.map((l) => [l.el, l]));
    this.#labels = [...this.#labelsHost.querySelectorAll<HTMLElement>("[data-anchor]")].map(
      (el) => previous.get(el) ?? { el, id: el.dataset.anchor ?? "", half: 0, x: Number.NaN, y: Number.NaN, visible: false },
    );
    // Half the label's width, so a label near the edge is kept inside the view (measured once per render, not per frame).
    for (const l of this.#labels) {
      l.id = l.el.dataset.anchor ?? "";
      l.half = (l.el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
      l.half /= 2;
      l.x = Number.NaN;
    }
    this.invalidate();
  }

  /* ── View, camera and input ────────────────────────────────────────────── */

  setView(view: TownView) {
    const previous = this.view;
    this.view = view;
    this.controls.enableDamping = !view.reducedMotion;
    if (previous.model !== view.model) this.sync();
    if (previous.entered !== view.entered) {
      this.applyEntered();
      if (view.entered) this.enterCamera(view.entered);
      else this.home(false);
    }
    const index = Math.min(view.focused, TOWN_CAPACITY - 1);
    const p = plotCenter(index);
    this.#ring.position.set(p.x, 0.2, p.z);
    this.#ring.visible = view.ringVisible && !view.entered && index < view.model.buildings.length;
    this.refreshLabels();
  }

  applyEntered() {
    for (const [slug, plot] of this.#plots) plot.detail.visible = slug === this.view.entered;
    this.invalidate();
  }

  /** The frustum height (at zoom 1) that frames `bounds` from the current camera direction. */
  spanFor(bounds: Bounds, height: number): number {
    this.#offset.copy(this.camera.position).sub(this.controls.target).normalize();
    this.#right.crossVectors(UP, this.#offset).normalize();
    this.#up.crossVectors(this.#offset, this.#right).normalize();
    const cx = (bounds.minX + bounds.maxX) / 2,
      cz = (bounds.minZ + bounds.maxZ) / 2;
    let u = 0,
      v = 0;
    for (const x of [bounds.minX, bounds.maxX])
      for (const z of [bounds.minZ, bounds.maxZ])
        for (const y of [0, height]) {
          this.#v.set(x - cx, y - height / 2, z - cz);
          u = Math.max(u, Math.abs(this.#v.dot(this.#right)));
          v = Math.max(v, Math.abs(this.#v.dot(this.#up)));
        }
    const canvas = this.renderer.domElement;
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight) || 1;
    return Math.max(2 * v, (2 * u) / aspect) * 1.08;
  }

  home(immediate: boolean) {
    const b = usedBounds(this.view.model.buildings.length);
    const target = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    this.moveTo(target, target.clone().add(HOME_OFFSET), 1, immediate);
  }

  enterCamera(slug: string) {
    const index = this.view.model.buildings.findIndex((b) => b.slug === slug);
    if (index < 0) return;
    const p = plotCenter(index);
    const half = HALF + 0.6;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const target = new THREE.Vector3(p.x, 0.4, p.z);
    const span = this.spanFor({ minX: p.x - half, maxX: p.x + half, minZ: p.z - half, maxZ: p.z + half }, 2);
    this.moveTo(target, target.clone().add(offset), THREE.MathUtils.clamp(this.#span / span, 0.6, 7), false);
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
      if (this.view.entered) this.enterCamera(this.view.entered);
      else {
        // Home also resets the rotation.
        this.home(false);
      }
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

  plotAt(event: PointerEvent): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.#pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, (-(event.clientY - rect.top) / rect.height) * 2 + 1);
    this.#ray.setFromCamera(this.#pointer, this.camera);
    this.#hitList.length = 0;
    this.#ray.intersectObject(this.#hits, true, this.#hitList);
    const plot = this.#hitList[0]?.object.userData.plot as number | undefined;
    return plot !== undefined && plot < this.view.model.buildings.length ? plot : null;
  }
  pointerDown = (event: PointerEvent) => {
    this.#down = { x: event.clientX, y: event.clientY };
  };
  pointerUp = (event: PointerEvent) => {
    if (event.button !== 0 || Math.hypot(event.clientX - this.#down.x, event.clientY - this.#down.y) > 6) return;
    const plot = this.plotAt(event);
    const b = plot === null ? undefined : this.view.model.buildings[plot];
    if (b && b.slug !== this.view.entered) this.callbacks.enter(b.slug);
  };
  pointerMove = (event: PointerEvent) => {
    if (event.buttons || this.view.entered) return;
    const plot = this.plotAt(event);
    if (plot === this.#hovered) return;
    this.#hovered = plot;
    this.renderer.domElement.style.cursor = plot === null ? "" : "pointer";
    this.callbacks.hover(plot);
  };
  pointerLeave = () => {
    if (this.#hovered === null) return;
    this.#hovered = null;
    this.renderer.domElement.style.cursor = "";
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
    this.#span = this.spanFor(usedBounds(this.view.model.buildings.length), 2);
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
    if (this.#last && now - this.#last < 1000 / 30 - 0.5) {
      this.#raf = requestAnimationFrame(this.animate);
      return;
    }
    const dt = this.#last ? Math.min((now - this.#last) / 1000, 0.05) : 0;
    this.#last = now;
    if (this.#tween) {
      const alpha = this.view.reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
      this.camera.position.lerp(this.#tween.position, alpha);
      this.controls.target.lerp(this.#tween.target, alpha);
      this.camera.zoom = THREE.MathUtils.lerp(this.camera.zoom, this.#tween.zoom, alpha);
      this.camera.updateProjectionMatrix();
      if (this.camera.position.distanceTo(this.#tween.position) < 0.005 && Math.abs(this.camera.zoom - this.#tween.zoom) < 0.002) this.#tween = null;
    }
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
    this.#dirtyFrames--;
    if (!this.#raf && (this.#tween || this.#dirtyFrames > 0)) this.#raf = requestAnimationFrame(this.animate);
  };

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
    cancelAnimationFrame(this.#raf);
    this.#resize.disconnect();
    this.#themeWatch.disconnect();
    this.#schemeQuery.removeEventListener("change", this.themeChanged);
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
    const pooled = new Set(this.assets.geometries.values());
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && !pooled.has(o.geometry)) o.geometry.dispose();
      if (o instanceof THREE.InstancedMesh) o.dispose();
      if (o instanceof THREE.Light && "shadow" in o) (o.shadow as THREE.LightShadow).dispose();
    });
    disposeExtraMaterials(this.scene, this.assets);
    this.assets.dispose();
    this.renderer.dispose();
    canvas.remove();
  }
}

/** Adds `mesh` to `parent` at a local position. */
function put(parent: THREE.Object3D, mesh: THREE.Object3D, x: number, y: number, z: number) {
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** A five-pointed star, extruded; pooled by the caller. */
function starGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.11 : 0.26,
      angle = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(angle) * r,
      y = Math.sin(angle) * r;
    if (i) shape.lineTo(x, y);
    else shape.moveTo(x, y);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }).translate(0, 0, -0.04);
}
