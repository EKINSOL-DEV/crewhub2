/* The Greenhouse style: the botanical miniature studio as a `WorldStyle`. The manifest, palette, swatches and lighting
   presets are data (../style.json); simple models are parts-JSON (../models/<key>.json) drawn by the shared parts
   renderer; code draws only what needs it (the robot rig, shaders, stretchable walls and floors, instanced leaves). */
import * as THREE from "three";
import { validatePropModel, type PropModel } from "@crewhub/world-engine";
import type {
  EmblemName,
  ModelKey,
  ModelOptions,
  PaletteName,
  StyleManifest,
  StyleTheme,
  WorldStyle,
  WorldStyleFactory,
} from "@crewhub/world-style";
import manifestJson from "../style.json";
import * as civic from "./civic.ts";
import { environment } from "./environment.ts";
import { bench, desk, lamp, leadDesk, shelf, sofa, table, workdesk } from "./furniture.ts";
import { Kit, type GreenhouseManifestData } from "./kit.ts";
import { LIGHT_POOLS, SURFACES } from "./keys.ts";
import { partsModel } from "./parts.ts";
import * as pieces from "./pieces.ts";
import * as shell from "./shell.ts";
import { robot } from "./robot.ts";
import * as town from "./town.ts";

type ManifestFile = StyleManifest & GreenhouseManifestData;
const manifest = manifestJson as unknown as ManifestFile;

/** Data models by file name without `.json`: `<key>` or `<key>.<variant>`. Invalid files are skipped with a warning. */
const dataModels = new Map<string, PropModel>();
for (const [path, json] of Object.entries(import.meta.glob<unknown>("../models/*.json", { eager: true, import: "default" }))) {
  const name = path.slice(path.lastIndexOf("/") + 1, -".json".length);
  const checked = validatePropModel(json);
  if (checked.ok) dataModels.set(name, checked.value);
  else console.warn(`Greenhouse style: ${name}.json is not a valid crewhub-prop/1 model`, checked.errors);
}

class GreenhouseStyle implements WorldStyle {
  readonly manifest: StyleManifest = manifest;
  readonly #kit = new Kit(manifest, manifest.lighting);
  readonly #glass: THREE.ShaderMaterial;

  constructor() {
    this.#glass = pieces.glass(this.#kit);
    town.townTheme(this.#kit, this.#kit.theme);
  }

  model(key: ModelKey, options: ModelOptions = {}): THREE.Object3D | null {
    const object = this.#data(key, options) ?? this.#code(key, options);
    if (!object) return null;
    const surface = SURFACES[key];
    if (surface !== undefined) object.userData.surface = surface;
    const pool = LIGHT_POOLS[key];
    if (pool) {
      // A warm pool of light on the ground under a lamp (lamplight, Pretty only); kept apart from static batching.
      const decal = this.#kit.decal("pool", pool.radius * 0.25, pool.radius * 0.25, pool.radius * 0.75);
      decal.position.set(0, pool.y, pool.z ?? 0);
      object.add(decal);
    }
    return object;
  }

  /** A part for the landmarks: a data prop or a code piece, by key. */
  readonly #piece = (key: string): THREE.Object3D => {
    const model = dataModels.get(key);
    return model ? partsModel(model, this.#kit) : (this.#code(key as ModelKey, {}) ?? new THREE.Group());
  };

  #data(key: ModelKey, options: ModelOptions): THREE.Object3D | null {
    const model = (options.variant && dataModels.get(`${key}.${options.variant}`)) || dataModels.get(key);
    if (!model) return null;
    const group = partsModel(model, this.#kit, options.accent ?? null);
    if (key === "drone") this.#rotors(group);
    if (key === "civic.fountain") civic.fountainWater(group, this.#kit);
    return group;
  }

  /** The drone's rotor blur: a thin blade over each rotor disc, spun by the animation hook. */
  #rotors(drone: THREE.Group) {
    const blades: THREE.Mesh[] = [];
    const material = this.#kit.material("drone-rotor", { transparent: 0.6 });
    const geometry = this.#kit.geometry("drone:blade", () => new THREE.BoxGeometry(0.17, 0.006, 0.022));
    for (const child of [...drone.children]) {
      if (!(child instanceof THREE.Mesh) || child.material !== this.#kit.material("glass", { transparent: 0.55 })) continue;
      const blade = new THREE.Mesh(geometry, material);
      blade.position.copy(child.position).setY(child.position.y + 0.008);
      drone.add(blade);
      blades.push(blade);
    }
    drone.userData.animate = (seconds: number) => {
      for (const blade of blades) blade.rotation.y += seconds * 40;
    };
  }

  #code(key: ModelKey, o: ModelOptions): THREE.Object3D | null {
    const kit = this.#kit;
    if (key.startsWith("emblem.")) return pieces.emblem(kit, key.slice("emblem.".length) as EmblemName, o);
    switch (key) {
      case "ground":
        return town.ground(kit, o);
      case "plot":
        return town.plot(kit, o);
      case "town.paving":
        return town.paving(kit, o);
      case "town.hedge":
        return town.hedge(kit, o);
      case "town.flower-bed":
        return town.flowerBed(kit, o);
      case "town.pond":
        return town.pond(kit, o);
      case "town.bridge":
        return town.bridge(kit, o);
      case "town.fence":
        return town.fence(kit, o);
      case "town.lantern":
        return town.lantern(kit);
      case "path":
        return pieces.path(kit, o);
      case "street-lamp":
        return pieces.streetLamp(kit);
      case "planting":
      case "furniture.plant":
        return pieces.planting(kit, o);
      case "wall":
        return shell.tallWall(kit, o, this.#glass);
      case "wall.low":
        return shell.rim(kit, o);
      case "wall.glass":
        return shell.glassWall(kit, o, this.#glass);
      case "door":
        return shell.entrance(kit, o);
      case "building.partition":
        return shell.partition(kit, o);
      case "building.door-frame":
        return shell.doorFrame(kit, o);
      case "building.slab":
        return shell.slab(kit, o);
      case "building.apron":
        return shell.apron(kit, o);
      case "building.loading-door":
        return shell.loadingDoor(kit, o);
      case "building.ivy":
        return shell.ivy(kit, o);
      case "building.closed-sign":
        return shell.closedSign(kit);
      case "floor":
        return pieces.floor(kit, o);
      case "room.sign":
        return pieces.roomSign(kit);
      case "building.flag":
        return shell.flag(kit, o);
      case "building.planks":
        return shell.planks(kit, o);
      case "post-office":
        return civic.postOffice(kit, this.#piece);
      case "town-hall":
        return civic.townHall(kit, this.#piece);
      case "civic.square":
        return civic.square(kit, this.#piece);
      case "civic.cafe":
        return civic.cafe(kit, this.#piece);
      case "furniture.desk":
        return desk(kit, o.seed ?? 0);
      case "furniture.bench":
        return bench(kit);
      case "furniture.lamp":
        return lamp(kit);
      case "furniture.sofa":
        return sofa(kit);
      case "furniture.table":
        return table(kit);
      case "furniture.shelf":
        return shelf(kit);
      case "furniture.workdesk":
        return workdesk(kit, o.seed ?? 0);
      case "furniture.lead-desk":
        return leadDesk(kit);
      case "ticket.strap":
        return pieces.straps(kit, o);
      case "ticket.seal":
        return pieces.band(kit, o, "seal-tape");
      case "ticket.band":
        return pieces.band(kit, o, o.accent ?? "sage");
      case "ticket.sticker":
        return pieces.sticker(kit, o);
      case "ticket.speech":
        return pieces.speech(kit);
      case "sparkle":
        return pieces.sparkle(kit);
      case "focus-ring":
        return pieces.focusRing(kit, o);
      case "town.contact-shadow":
        return pieces.contactShadow(kit, o);
      default:
        return null;
    }
  }

  robot(options: Parameters<WorldStyle["robot"]>[0]) {
    return robot(this.#kit, options);
  }

  parts(prop: PropModel): THREE.Object3D {
    return partsModel(prop, this.#kit);
  }

  color(name: PaletteName, theme: StyleTheme): THREE.Color {
    return new THREE.Color(this.#kit.hex(name, theme));
  }

  setTheme(theme: StyleTheme) {
    this.#kit.setTheme(theme);
    this.#glass.uniforms.uColor!.value.set(this.#kit.hex("window"));
    this.#glass.uniforms.uOpacity!.value = theme === "lamplight" ? 0.82 : 0.32;
    town.townTheme(this.#kit, theme);
  }

  environment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, theme: StyleTheme) {
    return environment(
      scene,
      renderer,
      manifest.lighting,
      theme,
      (next) => this.setTheme(next),
      (quality) => this.#kit.setQuality(quality),
    );
  }

  /** Scale up from nothing with a sparkle; progress 0 → 1. Reversing progress de-materialises. */
  materialise(object: THREE.Object3D, progress: number) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    let sparkle = object.userData.materialiseSparkle as THREE.Object3D | undefined;
    if (!sparkle) {
      sparkle = pieces.sparkle(this.#kit);
      object.userData.materialiseSparkle = sparkle;
      object.add(sparkle);
    }
    const eased = 1 - Math.pow(1 - p, 3);
    object.scale.setScalar(Math.max(0.001, eased));
    sparkle.visible = p < 1;
    sparkle.scale.setScalar(Math.sin(p * Math.PI) * 2.2 + 0.001);
    sparkle.rotation.y = p * 3;
  }

  dispose() {
    this.#glass.dispose();
    this.#kit.dispose();
  }
}

export const greenhouseStyle: WorldStyleFactory = {
  manifest,
  create: () => new GreenhouseStyle(),
};
export const GREENHOUSE_STYLE_ID = manifest.id;
