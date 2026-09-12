import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  inBounds,
  type Cell,
  type Rotation,
  type WorldSimulation,
} from "@crewhub/world-engine";
import type { SessionSnapshot } from "@crewhub/protocol";
import {
  Assets,
  botModel,
  disposeExtraMaterials,
  propModel,
  type BotModel,
} from "./models";
import { crew, definitions } from "./data";
import { floorMaterial, glassMaterial } from "./shaders";

export interface PlacementTool {
  id: string;
  definitionId: string;
  rotation: Rotation;
}
export interface SceneView {
  selectedId: string;
  snapshot: SessionSnapshot;
  grid: boolean;
  paths: boolean;
  mode: "observe" | "walk" | "arrange";
  freeCamera: boolean;
  cutaway: boolean;
  reducedMotion: boolean;
  paused: boolean;
  lowQuality: boolean;
  placement: PlacementTool | null;
}
export type CameraAction =
  | "home"
  | "focus"
  | "rotate-left"
  | "rotate-right"
  | "zoom-in"
  | "zoom-out";
interface Callbacks {
  select: (id: string) => void;
  prop: (id: string) => void;
  notice: (message: string) => void;
  placed: () => void;
  changed: () => void;
  error: () => void;
}
interface Wall {
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  axis: "x" | "z";
  opacity: number;
}

export class RoomScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 90);
  readonly assets = new Assets();
  readonly controls: OrbitControls;
  readonly sim: WorldSimulation;
  readonly callbacks: Callbacks;
  view: SceneView;
  #props = new THREE.Group();
  #walls: Wall[] = [];
  #bots = new Map<string, BotModel>();
  #glass: THREE.ShaderMaterial[] = [];
  #floorGrid = { value: 0 };
  #cursor: Cell | null = null;
  #ghost = new THREE.Group();
  #path = new THREE.Group();
  #ray = new THREE.Raycaster();
  #plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  #pointer = new THREE.Vector2();
  #lastLayout;
  #lastRoute = "";
  #raf = 0;
  #last = 0;
  #time = 0;
  #disposed = false;
  #dirtyFrames = 2;
  #resize: ResizeObserver;
  #down = { x: 0, y: 0 };
  #labels: HTMLElement;
  #tween: {
    position: THREE.Vector3;
    target: THREE.Vector3;
    zoom: number;
  } | null = null;
  #labelPositions = new Map<
    string,
    { x: number; y: number; visible: boolean }
  >();

  constructor(
    host: HTMLElement,
    labels: HTMLElement,
    simulation: WorldSimulation,
    view: SceneView,
    callbacks: Callbacks,
  ) {
    this.sim = simulation;
    this.view = view;
    this.callbacks = callbacks;
    this.#labels = labels;
    this.#lastLayout = simulation.layout;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.debug.onShaderError = () => this.callbacks.error();
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, view.lowQuality ? 1 : 1.7),
    );
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = !view.lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute(
      "aria-label",
      "Interactive Greenhouse room. Arrow keys move the grid cursor. Enter selects a walking or placement destination. Escape cancels in the toolbar.",
    );
    host.appendChild(canvas);
    this.camera.position.set(14, 14.5, 14);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.5, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.enableRotate = false;
    this.controls.minZoom = 0.65;
    this.controls.maxZoom = 3;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = 1.34;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.addEventListener("start", this.cancelTween);
    this.controls.addEventListener("change", this.invalidate);
    this.controls.update();
    this.buildRoom();
    this.rebuildProps();
    crew.forEach((c, index) => {
      const bot = botModel(this.assets, c.color, c.id, index);
      this.#bots.set(c.id, bot);
      this.scene.add(bot.group);
    });
    this.scene.add(this.#ghost, this.#path);
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerleave", this.pointerLeave);
    canvas.addEventListener("keydown", this.keyDown);
    canvas.addEventListener("webglcontextlost", this.contextLost);
    document.addEventListener("visibilitychange", this.visibility);
    this.#resize = new ResizeObserver(this.resize);
    this.#resize.observe(host);
    this.resize();
    this.setView(view);
  }

  buildRoom() {
    const a = this.assets,
      g = this.sim.layout.grid,
      w = g.width * g.cellSize,
      d = g.depth * g.cellSize;
    this.scene.add(new THREE.HemisphereLight("#f7f5df", "#8c9c8b", 2.2));
    const sun = new THREE.DirectionalLight("#fff0cf", 3.3);
    sun.position.set(-4, 10, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.0001;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight("#e1efff", 0.8);
    fill.position.set(6, 5, 7);
    this.scene.add(fill);
    const plinth = a.box(w + 0.28, 0.38, d + 0.28, "#c7c7af", 0.12);
    plinth.position.y = -0.22;
    this.scene.add(plinth);
    const rim = a.box(w + 0.12, 0.07, d + 0.12, "#f2ecdc", 0.035);
    rim.position.y = -0.015;
    this.scene.add(rim);
    const floor = floorMaterial(g.width, g.depth);
    this.#floorGrid = floor.grid;
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      floor.material,
    );
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = 0.025;
    surface.receiveShadow = true;
    this.scene.add(surface);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.15 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.43;
    ground.receiveShadow = true;
    this.scene.add(ground);
    for (let i = 0; i < 2; i++) {
      const step = a.box(2.25 + i * 0.2, 0.12, 0.52, "#dad8c2");
      step.position.set(1.05, -0.22 - i * 0.12, d / 2 + 0.3 + i * 0.3);
      this.scene.add(step);
    }
    const left = new THREE.Group(),
      back = new THREE.Group();
    const wall = a.box(0.17, 2.85, d + 0.05, "#e8e4d1", 0.045);
    wall.position.set(-w / 2 - 0.02, 1.43, 0);
    left.add(wall);
    const ledge = a.box(0.24, 0.12, d + 0.12, "#c4c7ac");
    ledge.position.set(-w / 2, 2.85, 0);
    left.add(ledge);
    const skirt = a.box(0.12, 0.17, d, "#b8bfa4");
    skirt.position.set(-w / 2 + 0.09, 0.12, 0);
    left.add(skirt);
    // Architectural glass panes with fine etched bands and view-dependent Fresnel opacity.
    for (let i = 0; i < 6; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / 6;
      const glass = glassMaterial();
      this.#glass.push(glass);
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(w / 6 - 0.09, 2.6),
        glass,
      );
      pane.position.set(x, 1.55, -d / 2);
      back.add(pane);
      const bar = a.box(0.055, 2.96, 0.09, "#728c76", 0.01);
      bar.position.set(x - w / 12, 1.48, -d / 2);
      back.add(bar);
      const cross = a.box(w / 6, 0.045, 0.08, "#728c76", 0.01);
      cross.position.set(x, 1.58, -d / 2);
      back.add(cross);
    }
    const lastBar = a.box(0.055, 2.96, 0.09, "#728c76", 0.01);
    lastBar.position.set(w / 2, 1.48, -d / 2);
    back.add(lastBar);
    for (const y of [0.15, 2.97]) {
      const bar = a.box(w + 0.1, 0.12, 0.14, "#728c76");
      bar.position.set(0, y, -d / 2);
      back.add(bar);
    }
    // Wall art and a long timber ledge are part of the fading wall group.
    for (let i = 0; i < 3; i++) {
      const frame = a.box(0.05, 0.67, 0.55, "#baa47b", 0.02);
      frame.position.set(-w / 2 + 0.11, 1.96, -1.8 + i * 0.83);
      left.add(frame);
      const paper = a.box(0.014, 0.58, 0.46, "#f4ecd9", 0.01);
      paper.position.set(-w / 2 + 0.14, 1.96, -1.8 + i * 0.83);
      left.add(paper);
      const shape = a.sphere(0.18, ["#98aa84", "#d4b182", "#8fa497"][i]!);
      shape.scale.set(0.05, 1, 0.62);
      shape.position.set(-w / 2 + 0.16, 1.96, -1.8 + i * 0.83);
      left.add(shape);
    }
    for (const [group, axis] of [
      [left, "x"],
      [back, "z"],
    ] as const) {
      const materials: THREE.MeshStandardMaterial[] = [],
        clones = new Map<THREE.Material, THREE.MeshStandardMaterial>();
      group.traverse((o) => {
        if (
          o instanceof THREE.Mesh &&
          o.material instanceof THREE.MeshStandardMaterial
        ) {
          let m = clones.get(o.material);
          if (!m) {
            m = o.material.clone();
            m.transparent = true;
            clones.set(o.material, m);
            materials.push(m);
          }
          o.material = m;
        }
      });
      this.scene.add(group);
      this.#walls.push({ group, materials, axis, opacity: 1 });
    }
    // Pendant lights: small, carefully spaced silhouettes leave the overview unobstructed.
    for (const x of [-3.3, 0, 3.3]) {
      const pendant = new THREE.Group();
      const cable = a.cylinder(0.012, 0.012, 0.36, "#839079");
      cable.position.y = 3.35;
      pendant.add(cable);
      const shade = a.cylinder(0.2, 0.48, 0.24, "#d9cbb0");
      shade.position.y = 3.05;
      pendant.add(shade);
      const inside = a.cylinder(0.4, 0.4, 0.012, "#fff4cd");
      inside.position.y = 2.92;
      pendant.add(inside);
      pendant.position.set(x, 0, -2.3);
      this.scene.add(pendant);
    }
    // A subtle lounge rug, fully visual: it does not block the walk grid.
    const rug = a.box(2.72, 0.012, 2.65, "#d6cdb3", 0.06);
    rug.position.set(-2.6, 0.035, 1.7);
    this.scene.add(rug);
    for (let i = 0; i < 7; i++) {
      const stitch = a.box(2.45, 0.003, 0.008, "#e9dfc5", 0.001);
      stitch.position.set(-2.6, 0.043, 0.58 + i * 0.37);
      this.scene.add(stitch);
    }
  }

  rebuildProps() {
    this.#props.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    disposeExtraMaterials(this.#props, this.assets);
    this.#props.clear();
    for (const prop of this.sim.layout.props)
      this.#props.add(propModel(prop, this.assets, this.sim.layout.grid));
    this.scene.add(this.#props);
    this.#lastLayout = this.sim.layout;
  }
  setView(view: SceneView) {
    const changed =
      this.view.placement !== view.placement || this.view.mode !== view.mode;
    if (this.view.lowQuality !== view.lowQuality) {
      this.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, view.lowQuality ? 1 : 1.7),
      );
      this.renderer.shadowMap.enabled = !view.lowQuality;
    }
    this.view = view;
    this.controls.enableRotate = view.freeCamera;
    this.controls.enableDamping = !view.reducedMotion;
    this.#floorGrid.value = view.grid || view.mode !== "observe" ? 1 : 0;
    if (changed) this.drawGhost();
    this.invalidate();
  }
  cameraAction(action: CameraAction) {
    let target = this.controls.target.clone(),
      position = this.camera.position.clone(),
      zoom = this.camera.zoom;
    if (action === "home") {
      target.set(0, 0.5, 0);
      position.set(14, 14.5, 14);
      zoom = 1;
    }
    if (action === "focus") {
      const actor = this.sim.actors.find((a) => a.id === this.view.selectedId);
      if (actor) {
        const p = this.world(this.sim.position(actor));
        const direction = position.clone().sub(target);
        target.set(p.x, 0.6, p.z);
        position.copy(target).add(direction);
        zoom = 1.85;
      }
    }
    if (action.startsWith("rotate")) {
      const offset = position.clone().sub(target);
      offset.applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        action === "rotate-left" ? Math.PI / 2 : -Math.PI / 2,
      );
      position.copy(target).add(offset);
    }
    if (action === "zoom-in") zoom = Math.min(3, zoom * 1.2);
    if (action === "zoom-out") zoom = Math.max(0.65, zoom / 1.2);
    this.#tween = { position, target, zoom };
    this.invalidate();
  }
  cancelTween = () => {
    this.#tween = null;
  };
  world(cell: Cell) {
    const g = this.sim.layout.grid;
    return {
      x: (cell.x + 0.5 - g.width / 2) * g.cellSize,
      z: (cell.z + 0.5 - g.depth / 2) * g.cellSize,
    };
  }
  pick(event: PointerEvent): Cell | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.#pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.#ray.setFromCamera(this.#pointer, this.camera);
    const p = this.#ray.ray.intersectPlane(this.#plane, new THREE.Vector3());
    if (!p) return null;
    const g = this.sim.layout.grid,
      c = {
        x: Math.floor(p.x / g.cellSize + g.width / 2),
        z: Math.floor(p.z / g.cellSize + g.depth / 2),
      };
    return inBounds(g, c) ? c : null;
  }
  pointerDown = (event: PointerEvent) => {
    this.#down = { x: event.clientX, y: event.clientY };
  };
  pointerUp = (event: PointerEvent) => {
    if (
      event.button !== 0 ||
      Math.hypot(event.clientX - this.#down.x, event.clientY - this.#down.y) > 6
    )
      return;
    this.#cursor = this.pick(event);
    this.invalidate();
    if (this.view.placement || this.view.mode === "walk") {
      this.applyCursor();
      return;
    }
    const targets = [...this.#bots.values()].map((b) => b.group);
    if (this.view.mode === "arrange") targets.push(this.#props);
    const hit = this.#ray.intersectObjects(targets, true)[0];
    if (hit?.object.userData.agentId)
      this.callbacks.select(hit.object.userData.agentId as string);
    else if (hit?.object.userData.propId)
      this.callbacks.prop(hit.object.userData.propId as string);
  };
  pointerMove = (event: PointerEvent) => {
    if (event.buttons) return;
    const c = this.pick(event);
    if (c?.x !== this.#cursor?.x || c?.z !== this.#cursor?.z) {
      this.#cursor = c;
      this.drawGhost();
    }
  };
  pointerLeave = () => {
    this.#cursor = null;
    this.drawGhost();
  };
  keyDown = (event: KeyboardEvent) => {
    const delta: Record<string, Cell> = {
      ArrowUp: { x: 0, z: -1 },
      ArrowDown: { x: 0, z: 1 },
      ArrowLeft: { x: -1, z: 0 },
      ArrowRight: { x: 1, z: 0 },
    };
    if (delta[event.key]) {
      event.preventDefault();
      const c =
        this.#cursor ??
        this.sim.actors.find((a) => a.id === this.view.selectedId)!.cell;
      const target = {
        x: c.x + delta[event.key]!.x,
        z: c.z + delta[event.key]!.z,
      };
      if (inBounds(this.sim.layout.grid, target)) {
        this.#cursor = target;
        this.drawGhost();
      }
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.applyCursor();
      this.invalidate();
    }
  };
  applyCursor() {
    if (!this.#cursor) {
      this.callbacks.notice("Choose a cell inside the room.");
      return;
    }
    if (this.view.placement) {
      const result = this.sim.place({
        ...this.view.placement,
        cell: this.#cursor,
      });
      if (result.ok) {
        this.rebuildProps();
        this.callbacks.placed();
        this.callbacks.changed();
        this.callbacks.notice("Placed on the grid. Walkways stay clear.");
      } else this.callbacks.notice(result.reason);
    } else if (this.view.mode === "walk") {
      if (this.view.snapshot.connection === "disconnected") {
        this.callbacks.notice(
          "Reconnect the simulation before moving the crew.",
        );
        return;
      }
      const result = this.sim.route(this.view.selectedId, this.#cursor);
      this.callbacks.notice(
        result.ok
          ? this.view.paused
            ? "Route ready. Resume the simulation to walk."
            : "Route found. Taking the scenic way."
          : result.reason,
      );
    }
    this.drawGhost();
  }
  clearTransient(group: THREE.Group) {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    group.clear();
  }
  drawGhost() {
    this.invalidate();
    this.clearTransient(this.#ghost);
    if (!this.#cursor || (this.view.mode === "observe" && !this.view.placement))
      return;
    const g = this.sim.layout.grid;
    let w = 1,
      d = 1,
      valid = true;
    if (this.view.placement) {
      const def = definitions[this.view.placement.definitionId]!.footprint;
      w = this.view.placement.rotation % 2 ? def.depth : def.width;
      d = this.view.placement.rotation % 2 ? def.width : def.depth;
      valid = this.sim.placement({
        ...this.view.placement,
        cell: this.#cursor,
      }).ok;
    }
    const color = valid ? "#528b65" : "#c47659";
    const p = this.world(this.#cursor);
    const ghost = new THREE.Mesh(
      new THREE.PlaneGeometry(w * g.cellSize - 0.04, d * g.cellSize - 0.04),
      new THREE.MeshBasicMaterial({
        color,
        opacity: 0.38,
        transparent: true,
        depthWrite: false,
      }),
    );
    ghost.rotation.x = -Math.PI / 2;
    ghost.position.set(
      p.x + ((w - 1) * g.cellSize) / 2,
      0.058,
      p.z + ((d - 1) * g.cellSize) / 2,
    );
    this.#ghost.add(ghost);
  }
  drawPath() {
    this.clearTransient(this.#path);
    if (!this.view.paths && this.view.mode !== "walk") return;
    const a = this.sim.actors.find(
      (actor) => actor.id === this.view.selectedId,
    );
    if (!a || (!a.next && !a.path.length)) return;
    const cells = [
      this.sim.position(a),
      ...(a.next ? [a.next] : []),
      ...a.path,
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(
      cells.map((c) => {
        const p = this.world(c);
        return new THREE.Vector3(p.x, 0.07, p.z);
      }),
    );
    const line = new THREE.Line(
      geometry,
      new THREE.LineDashedMaterial({
        color: "#5b8167",
        dashSize: 0.13,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.75,
      }),
    );
    line.computeLineDistances();
    this.#path.add(line);
    const goal = this.world(cells[cells.length - 1]!);
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.18, 24),
      new THREE.MeshBasicMaterial({ color: "#5b8167", side: THREE.DoubleSide }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(goal.x, 0.075, goal.z);
    this.#path.add(marker);
  }
  resize = () => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    const width = parent.clientWidth,
      height = parent.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    const aspect = width / height,
      span = Math.max(11.8, 15.5 / aspect);
    this.camera.left = (-span * aspect) / 2;
    this.camera.right = (span * aspect) / 2;
    this.camera.top = span / 2;
    this.camera.bottom = -span / 2;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  };
  invalidate = () => {
    this.#dirtyFrames = 45;
    if (!this.#raf && !this.#disposed && !document.hidden)
      this.#raf = requestAnimationFrame(this.animate);
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
    // Cap presentation at 30 fps; paused/static reduced-motion views settle and sleep.
    if (this.#last && now - this.#last < 1000 / 30 - 0.5) {
      this.#raf = requestAnimationFrame(this.animate);
      return;
    }
    const dt = this.#last ? Math.min((now - this.#last) / 1000, 0.05) : 0;
    this.#last = now;
    const running =
      !this.view.paused && this.view.snapshot.connection !== "disconnected";
    if (running) {
      this.sim.tick(dt);
      if (!this.view.reducedMotion) this.#time += dt;
    }
    if (this.sim.layout !== this.#lastLayout) this.rebuildProps();
    if (this.#tween) {
      const alpha = this.view.reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
      this.camera.position.lerp(this.#tween.position, alpha);
      this.controls.target.lerp(this.#tween.target, alpha);
      this.camera.zoom = THREE.MathUtils.lerp(
        this.camera.zoom,
        this.#tween.zoom,
        alpha,
      );
      this.camera.updateProjectionMatrix();
      if (
        this.camera.position.distanceTo(this.#tween.position) < 0.005 &&
        Math.abs(this.camera.zoom - this.#tween.zoom) < 0.002
      )
        this.#tween = null;
    }
    this.controls.update();
    // Keep panning bounded to the room rather than allowing it to disappear.
    const clamped = this.controls.target.clone();
    clamped.x = THREE.MathUtils.clamp(clamped.x, -5.4, 5.4);
    clamped.z = THREE.MathUtils.clamp(clamped.z, -4.2, 4.2);
    clamped.y = THREE.MathUtils.clamp(clamped.y, 0, 1.5);
    this.camera.position.add(clamped.clone().sub(this.controls.target));
    this.controls.target.copy(clamped);
    for (const wall of this.#walls) {
      const nearSide = this.camera.position[wall.axis] < -1;
      const opacity = this.view.cutaway ? 0.12 : nearSide ? 0.17 : 1;
      wall.opacity = THREE.MathUtils.lerp(
        wall.opacity,
        opacity,
        this.view.reducedMotion ? 1 : 0.12,
      );
      wall.materials.forEach((m) => {
        m.opacity = wall.opacity;
        m.depthWrite = wall.opacity > 0.95;
      });
    }
    this.#glass.forEach((g) => {
      g.uniforms.uOpacity!.value =
        this.view.cutaway || this.camera.position.z < -1 ? 0.08 : 0.32;
    });
    const t = this.#time;
    const width = this.renderer.domElement.clientWidth,
      height = this.renderer.domElement.clientHeight;
    crew.forEach((c, index) => {
      const actor = this.sim.actors[index]!,
        bot = this.#bots.get(c.id)!,
        p = this.world(this.sim.position(actor));
      bot.group.position.set(p.x, 0, p.z);
      const status = this.view.snapshot.sessions[index]!.status;
      const moving = !!actor.next;
      const motion = !this.view.reducedMotion && running;
      const beat = motion ? Math.sin(t * (moving ? 12 : 2.2) + index * 1.8) : 0;
      bot.body.position.y =
        0.12 + (motion ? (moving ? Math.abs(beat) * 0.045 : beat * 0.013) : 0);
      bot.head.rotation.z =
        motion && status === "idle" ? Math.sin(t + index) * 0.07 : 0;
      bot.head.rotation.x =
        motion && status === "working" ? -0.08 + beat * 0.025 : 0;
      bot.arms[0]!.rotation.x =
        moving && motion ? beat * 0.6 : status === "working" ? -0.45 : 0;
      bot.arms[1]!.rotation.z =
        status === "needs-input"
          ? -2.15 + (motion ? Math.sin(t * 3) * 0.13 : 0)
          : status === "completed"
            ? -0.55
            : -0.06;
      bot.arms[1]!.rotation.x = moving && motion ? -beat * 0.6 : 0;
      bot.feet.forEach((foot, i) => {
        foot.position.y =
          0.12 +
          (moving && motion
            ? Math.max(0, Math.sin(t * 12 + i * Math.PI)) * 0.08
            : 0);
      });
      const blink = motion && (t + index * 1.4) % 4.9 < 0.11;
      bot.eyes.forEach((eye) => {
        eye.scale.y = blink ? 0.15 : 1;
      });
      bot.halo.uniforms.uActive!.value =
        c.id === this.view.selectedId ? 1 : status === "needs-input" ? 0.65 : 0;
      bot.halo.uniforms.uTime!.value = t;
      if (actor.next) {
        const angle = Math.atan2(
          actor.next.x - actor.cell.x,
          actor.next.z - actor.cell.z,
        );
        const diff = Math.atan2(
          Math.sin(angle - bot.group.rotation.y),
          Math.cos(angle - bot.group.rotation.y),
        );
        bot.group.rotation.y += diff * Math.min(1, dt * 12);
      } else {
        const goal = status === "working" ? 0.4 : 0.15;
        const diff = Math.atan2(
          Math.sin(goal - bot.group.rotation.y),
          Math.cos(goal - bot.group.rotation.y),
        );
        bot.group.rotation.y += diff * Math.min(1, dt * 3);
      }
      const projected = new THREE.Vector3(p.x, 1.82, p.z).project(this.camera);
      const label = this.#labels.querySelector<HTMLElement>(
        `[data-agent-label="${c.id}"]`,
      );
      const x = (projected.x * 0.5 + 0.5) * width,
        y = (-projected.y * 0.5 + 0.5) * height;
      const visible =
        projected.z > -1 &&
        projected.z < 1 &&
        x > 10 &&
        x < width - 10 &&
        y > 10 &&
        y < height - 10;
      const previous = this.#labelPositions.get(c.id);
      if (
        label &&
        (!previous ||
          Math.abs(previous.x - x) > 0.2 ||
          Math.abs(previous.y - y) > 0.2 ||
          previous.visible !== visible)
      ) {
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
        label.style.visibility = visible ? "visible" : "hidden";
        this.#labelPositions.set(c.id, { x, y, visible });
      }
    });
    const routeKey = `${this.sim.revision}:${this.view.selectedId}:${this.view.paths}:${this.view.mode}:${this.sim.actors.map((a) => `${a.cell.x},${a.cell.z},${a.path.length}`).join(";")}`;
    if (routeKey !== this.#lastRoute) {
      this.#lastRoute = routeKey;
      this.drawPath();
    }
    try {
      this.renderer.render(this.scene, this.camera);
    } catch {
      this.callbacks.error();
      return;
    }
    this.#dirtyFrames--;
    const moving =
      running && this.sim.actors.some((a) => a.next || a.path.length);
    if (
      !this.#raf &&
      ((running && !this.view.reducedMotion) ||
        moving ||
        this.#tween ||
        this.#dirtyFrames > 0)
    )
      this.#raf = requestAnimationFrame(this.animate);
  };
  dispose() {
    this.#disposed = true;
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
    canvas.removeEventListener("keydown", this.keyDown);
    canvas.removeEventListener("webglcontextlost", this.contextLost);
    const pooled = new Set(this.assets.geometries.values());
    this.scene.traverse((o) => {
      if (
        (o instanceof THREE.Mesh || o instanceof THREE.Line) &&
        !pooled.has(o.geometry)
      )
        o.geometry.dispose();
    });
    this.clearTransient(this.#path);
    this.clearTransient(this.#ghost);
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      if (o instanceof THREE.Light && "shadow" in o)
        (o.shadow as THREE.LightShadow).dispose();
    });
    disposeExtraMaterials(this.scene, this.assets);
    this.assets.dispose();
    this.renderer.dispose();
    canvas.remove();
  }
}
