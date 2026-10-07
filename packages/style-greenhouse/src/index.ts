/* The Greenhouse style: the botanical miniature studio as a `WorldStyle`. The manifest, palette, swatches and lighting
   presets are data (../style.json); simple models are parts-JSON (../models/<key>.json) drawn by the shared parts
   renderer; code draws only what needs it (shaders, stretchable walls and floors, instanced leaves). */
import * as THREE from "three";
import { validatePropModel, type PropModel } from "@crewhub/world-engine";
import type { CastManifest, FigureKit } from "@crewhub/world-cast";
import type {
  EmblemName,
  ModelKey,
  ModelOptions,
  PaletteName,
  StyleManifest,
  StyleOptionValues,
  StyleTheme,
  WorldStyle,
  WorldStyleFactory,
} from "@crewhub/world-style";
import { resolveStyleOptions } from "@crewhub/world-style";
import manifestJson from "../style.json";
import * as civic from "./civic.ts";
import * as life from "./life.ts";
import { compileLights, type Light, type Lights } from "./daylight.ts";
import { environment } from "./environment.ts";
import { archiveCounter, bench, desk, huddleTable, lamp, leadDesk, officeWindow, roleDesk, shelf, sofa, statusRack, table, workdesk } from "./furniture.ts";
import { Kit, type GreenhouseManifestData } from "./kit.ts";
import { BLOB_SHADOWS, LIGHT_POOLS, SURFACES } from "./keys.ts";
import { compileLook, type Look, type LooksData, type MaterialSwap } from "./looks.ts";
import { partsModel } from "./parts.ts";
import * as pieces from "./pieces.ts";
import * as shell from "./shell.ts";
import { figureKit } from "./figureKit.ts";
import * as growth from "./growth.ts";
import * as town from "./town.ts";

type ManifestFile = StyleManifest & GreenhouseManifestData & { looks?: LooksData; materialSets?: Record<string, MaterialSwap[]> };
const manifest = manifestJson as unknown as ManifestFile;

/** Data models by file name without `.json`: `<key>` or `<key>.<variant>`. Invalid files are skipped with a warning. */
const dataModels = new Map<string, PropModel>();
for (const [path, json] of Object.entries(import.meta.glob<unknown>("../models/*.json", { eager: true, import: "default" }))) {
  const name = path.slice(path.lastIndexOf("/") + 1, -".json".length);
  const checked = validatePropModel(json);
  if (checked.ok) dataModels.set(name, checked.value);
  else console.warn(`Greenhouse style: ${name}.json is not a valid crewhub-prop/1 model`, checked.errors);
}

/** What draws a model: the style itself, or one of its looks (its own kit for what it recolours, and its data). */
interface Dresser {
  kit: Kit;
  look: Look | null;
}

class GreenhouseStyle implements WorldStyle {
  readonly manifest: StyleManifest = manifest;
  readonly #kit = new Kit(manifest, manifest.lighting);
  readonly #glass: THREE.ShaderMaterial;
  readonly #lights: Lights = compileLights(manifest.lighting);
  readonly #figureKits = new Map<string, FigureKit>();
  readonly #self: Dresser = { kit: this.#kit, look: null };
  readonly #looks = new Map<string, WorldStyle>();
  #evening = 0;

  constructor() {
    this.#glass = pieces.glass(this.#kit);
    town.townTheme(this.#kit);
    this.#light(this.#lights.day);
  }

  model(key: ModelKey, options: ModelOptions = {}): THREE.Object3D | null {
    return this.#model(this.#self, key, options);
  }

  /**
   * The style in a set of option values (looks.ts): the same models, lights and effects, with the look's swatches and
   * the models its data puts in place. The values that are all defaults are the style itself.
   */
  withOptions(values: StyleOptionValues): WorldStyle {
    const resolved = resolveStyleOptions(manifest, values);
    const look = compileLook(manifest.options ?? [], manifest.looks ?? {}, resolved, manifest.materialSets);
    if ((manifest.options ?? []).every((option) => resolved[option.id] === option.default)) return this;
    let dressed = this.#looks.get(look.id);
    if (dressed) return dressed;
    // A kit of its own even when the look recolours nothing: what the style bakes per kit (the landmarks) is the look's.
    const dresser: Dresser = { kit: new Kit(manifest, manifest.lighting, { of: this.#kit, swatches: look }), look };
    town.townLight(dresser.kit, this.#evening);
    dressed = {
      manifest,
      model: (key, options = {}) => this.#model(dresser, key, options),
      withOptions: (next) => this.withOptions(next),
      figureKit: (cast) => this.figureKit(cast),
      parts: (prop) => partsModel(prop, dresser.kit),
      color: (name, theme) => new THREE.Color(dresser.kit.hex(name, theme)),
      setTheme: (theme) => this.setTheme(theme),
      environment: (scene, renderer, theme) => this.environment(scene, renderer, theme),
      materialise: (object, progress) => this.materialise(object, progress),
      dispose: () => this.dispose(),
    };
    this.#looks.set(look.id, dressed);
    return dressed;
  }

  #model(dresser: Dresser, asked: ModelKey, options: ModelOptions): THREE.Object3D | null {
    const { kit } = dresser;
    // A look may put another model in this one's place, swap its materials, or leave the spot empty.
    const dressed = dresser.look?.dress(asked, options.variant, options.seed ?? 0);
    if (dressed === null) return new THREE.Group();
    const key = (dressed?.key ?? asked) as ModelKey;
    const o: ModelOptions = dressed ? { ...options, ...(dressed.variant ? { variant: dressed.variant } : {}) } : options;
    let object = this.#data(dresser, key, o, dressed?.materials ?? null) ?? this.#code(dresser, key, o);
    if (!object) return null;
    // Town dressing repeats in the thousands: lighter round parts, and no shadows from the small pieces.
    if (key.startsWith("town.") || key === "ground") town.townDetail(kit, object, key);
    const surface = SURFACES[key];
    if (surface !== undefined) object.userData.surface = surface;
    const pools = LIGHT_POOLS[key];
    for (const pool of pools === undefined ? [] : Array.isArray(pools) ? pools : [pools]) {
      // A warm pool of light on the ground under a lamp (lamplight, Pretty only); kept apart from static batching.
      // A small bright core and a long soft edge: a pool of light, not a disc.
      const decal = kit.decal(pool.kind ?? "pool", pool.radius * 0.08, pool.radius * 0.08, pool.radius * 0.92);
      decal.position.set(pool.x ?? 0, pool.y, pool.z ?? 0);
      object.add(decal);
    }
    const blob = BLOB_SHADOWS[key];
    if (blob) {
      const shadow = kit.decal("shadow", blob.halfX, blob.halfZ, blob.soft);
      shadow.position.y = 0.008;
      object.add(shadow);
    }
    if (dressed && dressed.scale !== 1) {
      // The caller places and sizes what it gets back, so the look's own size goes one level down.
      object.scale.multiplyScalar(dressed.scale);
      object = new THREE.Group().add(object);
    }
    return object;
  }

  /** A part for the landmarks: a data prop or a code piece, by key, as the dresser draws it. */
  #piece(dresser: Dresser) {
    return (asked: string): THREE.Object3D => {
      const dressed = dresser.look?.dress(asked, undefined, 0);
      if (dressed === null) return new THREE.Group();
      const key = (dressed?.key ?? asked) as ModelKey;
      const o: ModelOptions = dressed?.variant ? { variant: dressed.variant } : {};
      return this.#data(dresser, key, o, dressed?.materials ?? null) ?? this.#code(dresser, key, o) ?? new THREE.Group();
    };
  }

  #data(dresser: Dresser, key: ModelKey, options: ModelOptions, swap: Record<string, string> | null): THREE.Object3D | null {
    const model = (options.variant && dataModels.get(`${key}.${options.variant}`)) || dataModels.get(key);
    if (!model) return null;
    const group = partsModel(model, dresser.kit, options.accent ?? null, swap);
    if (key === "drone") this.#rotors(group);
    if (key === "civic.fountain") civic.fountainWater(group, dresser.kit);
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
    // Sparkle dust: a few motes swirl and twinkle under the drone while it flies. They show only once the animation
    // runs, so under reduced motion (renderers skip the hook) the drone keeps its plain fade.
    const motes = [0, 1, 2, 3, 4].map((i) => {
      const mote = new THREE.Mesh(this.#kit.geometry("drone:mote", () => new THREE.SphereGeometry(0.016, 8, 6)), this.#kit.material("sparkle", { glow: 0.9 }));
      mote.visible = false;
      mote.userData.phase = i * 1.26;
      drone.add(mote);
      return mote;
    });
    let time = 0;
    drone.userData.animate = (seconds: number) => {
      for (const blade of blades) blade.rotation.y += seconds * 40;
      time += seconds;
      for (const mote of motes) {
        const a = time * 2.4 + (mote.userData.phase as number);
        const fall = (time * 0.35 + (mote.userData.phase as number) / 6.3) % 1;
        mote.position.set(Math.cos(a) * 0.13, 0.3 - fall * 0.22, Math.sin(a) * 0.13);
        mote.scale.setScalar(Math.max(0.05, Math.sin(fall * Math.PI) * (0.7 + 0.3 * Math.sin(time * 9 + a))));
        mote.visible = true;
      }
    };
  }

  #code(dresser: Dresser, key: ModelKey, o: ModelOptions): THREE.Object3D | null {
    const { kit } = dresser;
    const piece = this.#piece(dresser);
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
      case "town.stream":
        return town.stream(kit, o);
      case "town.fence":
        return town.fence(kit, o);
      case "town.string-lights":
        return town.stringLights(kit, o);
      case "town.bunting":
        return town.bunting(kit, o);
      case "town.crossing":
        return town.crossing(kit, o);
      case "town.wear":
        return town.wear(kit, o);
      case "town.field":
        return town.field(kit, o);
      case "town.puddle":
        return town.puddle(kit, o);
      case "town.lantern":
        return town.lantern(kit, o);
      case "town.turf":
        return town.turf(kit, o);
      case "town.feature":
        // What stands between a district's buildings is the planting's to say (style.json "looks"); the town garden
        // leaves the spot to the grass.
        return new THREE.Group();
      case "town.staked-plot":
        return growth.stakedPlot(kit, o);
      case "town.plot-sign":
        return growth.plotSign(kit, o);
      case "town.scaffolding":
        return growth.scaffolding(kit, o);
      case "town.district-gate":
        return growth.districtGate(kit, o);
      case "town.zone-mark":
        return pieces.zoneMark(kit, o);
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
      case "building.name-sign":
        return shell.nameSign(kit, o);
      case "building.wall-lamp":
        return shell.wallLamp(kit, o);
      case "building.floor-shade": {
        const { width, depth } = o.size ?? { width: 2, height: 0, depth: 2 };
        return kit.edgeShade(width, depth);
      }
      case "building.silhouette":
        return shell.silhouette(kit, o);
      case "floor":
        return pieces.floor(kit, o);
      case "room.sign":
        return pieces.roomSign(kit);
      case "building.flag":
        return shell.flag(kit, o);
      case "building.planks":
        return shell.planks(kit, o);
      case "post-office":
        return civic.postOffice(kit, piece);
      case "town-hall":
        return civic.townHall(kit, piece);
      case "civic.square":
        return civic.square(kit, piece);
      case "civic.cafe":
        return civic.cafe(kit, piece);
      case "civic.greenhouse":
        return civic.greenhouse(kit);
      case "civic.windmill":
        return civic.windmill(kit);
      case "civic.welcome-sign":
        return civic.welcomeSign(kit);
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
        // The floor's desks by role: the analyst's screens, the designer's drawing board (addendum "three rooms").
        return o.variant === "analyst" || o.variant === "design" ? roleDesk(kit, o.variant, o.seed ?? 0) : workdesk(kit, o.seed ?? 0);
      case "furniture.lead-desk":
        return leadDesk(kit);
      case "furniture.rack-backlog":
      case "furniture.rack-planning":
      case "furniture.rack-review":
      case "furniture.rack-done":
        return statusRack(kit);
      case "furniture.huddle-table":
        return huddleTable(kit);
      case "furniture.archive-counter":
        return archiveCounter(kit);
      case "decor.office-window":
        return officeWindow(kit);
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
      case "focus-glow":
        return life.affordance(kit, "outline", o.size?.width ?? 4, o.size?.depth ?? 4);
      case "focus-fill":
        return life.affordance(kit, "fill", o.size?.width ?? 4, o.size?.depth ?? 4);
      case "selection-ring":
        return life.affordance(kit, "ring", 1.15, 1.15);
      case "town.contact-shadow":
        return pieces.contactShadow(kit, o);
      case "town.bird":
        return life.bird(kit);
      case "town.butterfly":
        return life.butterfly(kit);
      case "town.firefly":
        return life.firefly(kit);
      case "town.mote":
        return life.mote(kit);
      case "town.window-glow":
        return life.windowGlow(kit);
      case "town.ripple":
        return life.ripple(kit);
      case "town.steam":
        return life.steam(kit);
      case "town.cloud-shadow":
        return life.cloudShadow(kit);
      default:
        return null;
    }
  }

  /** The kit a cast draws its figures with: one per cast, so each cast's own colours follow the theme. */
  figureKit(cast: Pick<CastManifest, "id" | "colors">): FigureKit {
    let kit = this.#figureKits.get(cast.id);
    if (!kit) this.#figureKits.set(cast.id, (kit = figureKit(this.#kit, cast)));
    return kit;
  }

  parts(prop: PropModel): THREE.Object3D {
    return partsModel(prop, this.#kit);
  }

  color(name: PaletteName, theme: StyleTheme): THREE.Color {
    return new THREE.Color(this.#kit.hex(name, theme));
  }

  /** Swatches follow the theme, and the light starts at the theme's own; the environment's drift then shades it. */
  setTheme(theme: StyleTheme) {
    this.#kit.setTheme(theme);
    this.#glass.uniforms.uColor!.value.set(this.#kit.hex("window"));
    town.townTheme(this.#kit);
    life.lifeTheme(this.#kit);
    this.#light(this.#lights[theme]);
  }

  /** Lamps, lit windows, pools and glass follow the light of the time of day. */
  #light(light: Light) {
    this.#kit.setLight(light);
    const evening = THREE.MathUtils.clamp(light.evening, 0, 1);
    // By day the panes read a little more, with a soft sheen; in the evening the warm glass glows evenly, strongly
    // enough that a lit greenhouse wall reads from the town against the dark lawn behind it.
    this.#glass.uniforms.uOpacity!.value = 0.4 + (1.5 - 0.4) * evening;
    this.#glass.uniforms.uSheen!.value = 1 + (0.15 - 1) * evening;
    this.#evening = evening;
    // A look that recolours a lamp has that lamp's material of its own, and it follows the evening too.
    for (const kit of [this.#kit, ...this.#kit.looks]) town.townLight(kit, evening);
  }

  environment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, theme: StyleTheme) {
    return environment(
      scene,
      renderer,
      manifest.lighting,
      theme,
      (next) => this.setTheme(next),
      (quality) => this.#kit.setQuality(quality),
      (light) => this.#light(light),
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
    shell.disposeLettering();
    this.#glass.dispose();
    life.disposeLife(this.#kit);
    town.disposeTown(this.#kit);
    this.#kit.dispose();
  }
}

export const greenhouseStyle: WorldStyleFactory = {
  manifest,
  create: () => new GreenhouseStyle(),
};
export const GREENHOUSE_STYLE_ID = manifest.id;
