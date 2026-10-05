/* Ambient life: the gentle motion a small town is never without. By day soft cloud shadows drift over the town (and
   over its roofs, walls and people, where the style's light rig takes them: `setCloudShadows`), a few
   birds cross now and then (in the town view only), butterflies flutter over the flower beds and dust motes hang in
   the entered building's light. In the evening fireflies drift by the pond and the hedges and the landmarks' lit windows
   glow and breathe. Day and night, rings ripple on the pond and steam rises from the post office chimney and the
   café's cups. "Evening" is the environment's evening factor (0 by day, 1 in lamplight), so the life follows the
   day-night drift as well as the theme: the day's life thins out at dusk, fireflies come out one by one and the
   windows brighten slowly.

   Every piece is a style model by key (`town.bird`, `town.firefly`, …), drawn as one instanced mesh and moved here, so
   the whole layer costs a handful of draw calls. The style marks where steam rises and which windows glow with
   `userData.life` spots on its models (world-style's `LifeSpot`); the flower beds, hedges and the pond come from the
   town dressing. Nothing here decides facts: it is decoration only.

   It moves only when the viewer allows it: the Ambient setting on (all) or reduced (fewer, rarer), Pretty graphics,
   and no reduced motion; otherwise it is hidden. TownScene ticks it with the frame loop and keeps drawing for it only
   while the playback runs, so a paused or ambient-off town still idles. Deterministic per index (no Math.random). */
import * as THREE from "three";
import type { GraphicsQuality, LifeSpot, ModelKey, PaletteName, ResolvedStyle } from "@crewhub/world-style";
import type { Ambient } from "./movement";
import { noise, type Dressing } from "./townDressing";
import type { Bounds } from "./townLayout";
import { instancedMaterial } from "./instancedMaterial";

export interface LifeSettings {
  ambient: Ambient;
  reducedMotion: boolean;
  quality: GraphicsQuality;
}

/** The evening is followed in steps of this size: counts change at most this often during a dusk. */
const EVENING_STEPS = 24;
const smooth = (x: number, from: number, to: number) => THREE.MathUtils.smoothstep(x, from, to);

/* Capacities with Ambient on; "reduced" shows about half and birds come less often. */
const CLOUDS = 4;
const FLOCK = 5;
const BUTTERFLIES_PER_BED = 2;
const BUTTERFLIES = 16;
const FIREFLIES = 36;
const WINDOWS = 48;
const RIPPLES = 4;
const PUFFS_PER_SPOT = 4;
const STEAM = 24;
const MOTES = 28;
const WIND = new THREE.Vector3(1, 0, 0.35).normalize();
const BUTTERFLY_COLOURS: PaletteName[] = ["tangerine", "cream", "coral", "mist", "paper"];

/** One style model drawn as an instanced mesh; instances are written each tick through `put`. */
class Swarm {
  readonly mesh: THREE.InstancedMesh;
  readonly #base: THREE.Matrix4;
  #m = new THREE.Matrix4();
  #q = new THREE.Quaternion();
  #p = new THREE.Vector3();
  #s = new THREE.Vector3();
  #c = new THREE.Color();
  #e = new THREE.Euler();

  constructor(style: ResolvedStyle, key: ModelKey, capacity: number) {
    const model = style.model(key);
    model.updateMatrixWorld(true);
    let source: THREE.Mesh | null = model instanceof THREE.Mesh ? model : null;
    if (!source) model.traverse((o) => (source ??= o instanceof THREE.Mesh ? o : null));
    const mesh = source as THREE.Mesh | null;
    this.#base = mesh ? mesh.matrixWorld.clone() : new THREE.Matrix4();
    // The style's material through its instanced twin (instancedMaterial.ts): the style may draw it whole elsewhere.
    const material = mesh && !Array.isArray(mesh.material) ? instancedMaterial(mesh.material) : new THREE.MeshBasicMaterial();
    this.mesh = new THREE.InstancedMesh(mesh?.geometry ?? new THREE.BufferGeometry(), material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = mesh?.renderOrder ?? 0;
    // Instances spread over the town: the base geometry's bounds would cull them wrongly.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, this.#c.setRGB(1, 1, 1));
  }

  get capacity() {
    return this.mesh.instanceMatrix.count;
  }

  /** Instance `i` at (x, y, z), turned `yaw` around y (and `pitch` around its own z), scaled per axis. */
  put(i: number, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, pitch = 0) {
    this.#q.setFromEuler(this.#e.set(0, yaw, pitch, "YXZ"));
    this.#m.compose(this.#p.set(x, y, z), this.#q, this.#s.set(sx, sy, sz)).multiply(this.#base);
    this.mesh.setMatrixAt(i, this.#m);
  }
  /** A glow's brightness (additive: 0 is gone), or a tint. */
  shade(i: number, r: number, g = r, b = r) {
    this.mesh.setColorAt(i, this.#c.setRGB(r, g, b));
  }
  tint(i: number, color: THREE.Color) {
    this.mesh.setColorAt(i, color);
  }
  done(count: number, colours = false) {
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colours && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    // The geometry and material belong to the style.
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}

interface Home {
  x: number;
  y: number;
  z: number;
  seed: number;
}

export class AmbientLife {
  readonly group = new THREE.Group();
  #style: ResolvedStyle;
  #clouds: Swarm;
  #birds: Swarm;
  #butterflies: Swarm;
  #fireflies: Swarm;
  #windows: Swarm;
  #ripples: Swarm;
  #steam: Swarm;
  #motes: Swarm;
  #settings: LifeSettings = { ambient: "on", reducedMotion: false, quality: "pretty" };
  /** The evening factor, in `EVENING_STEPS` steps: 0 by day, 1 in lamplight. */
  #evening = 0;
  /** The evening factor as it is now, between the steps: fades and the windows' glow follow it. */
  #eveningNow = 0;
  /** The butterflies and fireflies the density allows when all are out. */
  #full = { butterflies: 0, fireflies: 0 };
  #t = 0;
  #beds: Home[] = [];
  #glowers: Home[] = [];
  #windowSpots: { position: THREE.Vector3; yaw: number }[] = [];
  #landmarkWindows: { position: THREE.Vector3; yaw: number }[] = [];
  #buildingWindows: { position: THREE.Vector3; yaw: number }[] = [];
  #steamSpots: Home[] = [];
  #pond: { x: number; y: number; z: number; rx: number; rz: number } | null = null;
  #building: Bounds | null = null;
  #flock = { next: 6, start: 0, from: new THREE.Vector3(), dir: new THREE.Vector3(), length: 0, size: 0 };
  /** The light rig's cloud shadows, or null: the clouds are then ground decals (`town.cloud-shadow`). */
  #lightClouds: ((clouds: ArrayLike<number>) => void) | null;
  #cloudData = new Float32Array(CLOUDS * 5);
  #cloudsShown = false;
  #cloudCount = 0;

  constructor(style: ResolvedStyle, lightClouds: ((clouds: ArrayLike<number>) => void) | null = null) {
    this.#style = style;
    this.#lightClouds = lightClouds;
    this.#clouds = new Swarm(style, "town.cloud-shadow", CLOUDS);
    this.#birds = new Swarm(style, "town.bird", FLOCK);
    this.#butterflies = new Swarm(style, "town.butterfly", BUTTERFLIES);
    this.#fireflies = new Swarm(style, "town.firefly", FIREFLIES);
    this.#windows = new Swarm(style, "town.window-glow", WINDOWS);
    this.#ripples = new Swarm(style, "town.ripple", RIPPLES);
    this.#steam = new Swarm(style, "town.steam", STEAM);
    this.#motes = new Swarm(style, "town.mote", MOTES);
    for (const swarm of this.#swarms()) this.group.add(swarm.mesh);
    this.group.name = "ambient-life";
    this.#apply();
  }

  #swarms(): Swarm[] {
    return [this.#clouds, this.#birds, this.#butterflies, this.#fireflies, this.#windows, this.#ripples, this.#steam, this.#motes];
  }

  /** On only for Ambient on or reduced, Pretty graphics and no reduced motion. */
  get enabled(): boolean {
    const s = this.#settings;
    return s.ambient !== "off" && s.quality === "pretty" && !s.reducedMotion;
  }

  /** Something is shown that moves: the frame loop keeps drawing for it while the playback runs. */
  get active(): boolean {
    return this.enabled && (this.#cloudCount > 0 || this.#swarms().some((s) => s.mesh.count > 0));
  }

  configure(settings: LifeSettings) {
    const s = this.#settings;
    if (s.ambient === settings.ambient && s.reducedMotion === settings.reducedMotion && s.quality === settings.quality) return;
    this.#settings = { ...settings };
    this.#apply();
  }

  /**
   * Follows the environment's evening factor (0 by day, 1 with every lamp lit). Counts change in steps; within a step
   * the newest firefly or butterfly fades (`#weight`), so nothing pops on or off at any playback speed.
   */
  setEvening(evening: number) {
    this.#eveningNow = THREE.MathUtils.clamp(evening, 0, 1);
    const stepped = Math.round(this.#eveningNow * EVENING_STEPS) / EVENING_STEPS;
    if (stepped === this.#evening) return;
    this.#evening = stepped;
    this.#apply();
  }

  /** Where life gathers: flower beds, hedges and the pond from the town dressing, steam and window spots on `landmarks`. */
  #ground: Bounds = { minX: -60, maxX: 60, minZ: -70, maxZ: 10 };
  setTown(dressing: readonly Dressing[], landmarks: THREE.Object3D) {
    this.#beds = [];
    this.#glowers = [];
    this.#pond = null;
    let ground: Bounds | null = null;
    for (const d of dressing) {
      // The whole ground: clouds drift and birds cross as far as the settlement reaches.
      if (d.key === "ground" && d.size) {
        const piece = { minX: d.x - d.size.width / 2, maxX: d.x + d.size.width / 2, minZ: d.z - d.size.depth / 2, maxZ: d.z + d.size.depth / 2 };
        ground = ground ? { minX: Math.min(ground.minX, piece.minX), maxX: Math.max(ground.maxX, piece.maxX), minZ: Math.min(ground.minZ, piece.minZ), maxZ: Math.max(ground.maxZ, piece.maxZ) } : piece;
      }
      if (d.key === "town.flower-bed") this.#beds.push({ x: d.x, y: d.y, z: d.z, seed: noise(d.x, d.z, 1) });
      if (d.key === "town.pond") {
        this.#pond = { x: d.x, y: d.y + 0.12, z: d.z, rx: (d.size?.width ?? 9) / 2, rz: (d.size?.depth ?? 5.6) / 2 };
      }
      if (d.key === "town.hedge" && d.size) {
        // A few fireflies along each hedge (hedges run along x before their turn).
        const along = Math.max(1, Math.round(d.size.width / 6));
        for (let i = 0; i < along; i++) {
          const t = (i + 0.5) / along - 0.5;
          this.#glowers.push({ x: d.x + Math.cos(d.rotation) * t * d.size.width, y: d.y, z: d.z - Math.sin(d.rotation) * t * d.size.width, seed: noise(d.x, d.z, i, 2) });
        }
      }
    }
    if (ground) this.#ground = ground;
    if (this.#pond)
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        this.#glowers.unshift({ x: this.#pond.x + Math.cos(a) * (this.#pond.rx + 0.6), y: this.#pond.y, z: this.#pond.z + Math.sin(a) * (this.#pond.rz + 0.6), seed: noise(i, 3) });
      }
    this.#landmarkWindows = [];
    this.#steamSpots = [];
    spotsIn(landmarks, (life, position, yaw) => {
      if (life === "window") this.#landmarkWindows.push({ position, yaw });
      if (life === "steam") this.#steamSpots.push({ x: position.x, y: position.y, z: position.z, seed: noise(position.x, position.z, 4) });
    });
    this.#windowSpots = [...this.#landmarkWindows, ...this.#buildingWindows];
    this.#apply();
  }

  /** The buildings' window spots (their shells' tall walls), gathered again whenever a shell is rebuilt. */
  setBuildingWindows(roots: readonly THREE.Object3D[]) {
    this.#buildingWindows = [];
    for (const root of roots) spotsIn(root, (life, position, yaw) => life === "window" && this.#buildingWindows.push({ position, yaw }));
    this.#windowSpots = [...this.#landmarkWindows, ...this.#buildingWindows];
    this.#apply();
  }

  /** The entered building's bounds (motes hang in its light), or null in the town. */
  setBuilding(bounds: Bounds | null) {
    this.#building = bounds;
    this.#apply();
  }

  /** Counts per swarm for the evening and the density; colours that do not change per frame. */
  #apply() {
    const on = this.enabled;
    this.group.visible = on;
    const e = this.#evening;
    // The day's life thins out through the dusk; fireflies come out as it deepens.
    const day = 1 - smooth(e, 0.25, 0.6),
      dusk = smooth(e, 0.45, 0.95);
    const share = this.#settings.ambient === "reduced" ? 0.5 : 1;
    const n = (count: number, capacity: number) => (on ? Math.min(capacity, Math.round(count * share)) : 0);
    this.#cloudCount = Math.round(n(CLOUDS, CLOUDS) * day);
    this.#clouds.mesh.count = this.#lightClouds ? 0 : this.#cloudCount;
    if (this.#lightClouds && !this.#cloudCount && this.#cloudsShown) {
      this.#lightClouds([]);
      this.#cloudsShown = false;
    }
    // One step ahead of the count, so the newest one is there to fade in (or out) through the step.
    this.#full = { butterflies: n(this.#beds.length * BUTTERFLIES_PER_BED, BUTTERFLIES), fireflies: n(this.#glowers.length * 2, FIREFLIES) };
    this.#butterflies.mesh.count = Math.ceil(this.#full.butterflies * Math.min(1, day + 1 / EVENING_STEPS));
    this.#fireflies.mesh.count = Math.ceil(this.#full.fireflies * Math.min(1, dusk + 1 / EVENING_STEPS));
    this.#windows.mesh.count = e > 0.05 && on ? Math.min(WINDOWS, this.#windowSpots.length) : 0;
    this.#ripples.mesh.count = this.#pond ? n(RIPPLES, RIPPLES) : 0;
    this.#steam.mesh.count = on ? Math.min(STEAM, this.#steamSpots.length * PUFFS_PER_SPOT) : 0;
    this.#motes.mesh.count = this.#building ? Math.round(n(MOTES, MOTES) * day) : 0;
    this.#birds.mesh.count = 0;
    for (let i = 0; i < this.#butterflies.capacity; i++) {
      const home = this.#beds[Math.floor(i / BUTTERFLIES_PER_BED)];
      const pick = BUTTERFLY_COLOURS[Math.floor(noise(i, home?.seed ?? 0, 5) * BUTTERFLY_COLOURS.length)]!;
      this.#butterflies.tint(i, this.#style.color(pick, "day"));
    }
    if (this.#butterflies.mesh.instanceColor) this.#butterflies.mesh.instanceColor.needsUpdate = true;
    // Place everything once, so a paused town shows life where it was.
    this.tick(0);
  }

  /** Advances the life by `seconds` (zero redraws it in place). */
  tick(seconds: number) {
    if (!this.group.visible) return;
    this.#t += seconds;
    const t = this.#t;
    this.#tickClouds(t);
    this.#tickBirds(t, seconds);
    this.#tickButterflies(t);
    this.#tickFireflies(t);
    this.#tickWindows(t);
    this.#tickRipples(t);
    this.#tickSteam(t);
    this.#tickMotes(t);
  }

  /** Instance `i` of `full` at a share `amount` (0 to 1) of them: 1 while inside the share, fading at its edge. */
  #weight(i: number, full: number, amount: number): number {
    return THREE.MathUtils.clamp(amount * full - i, 0, 1);
  }

  #tickClouds(t: number) {
    const swarm = this.#clouds,
      count = this.#cloudCount;
    if (!count) return;
    const b = this.#ground;
    const w = b.maxX - b.minX + 24,
      d = b.maxZ - b.minZ + 24;
    for (let i = 0; i < count; i++) {
      // Each cloud drifts with the wind and comes round again on the far side.
      const along = (noise(i, 6) * w + t * (0.5 + noise(i, 7) * 0.3)) % w;
      const x = b.minX - 12 + along,
        z = b.minZ - 12 + ((noise(i, 8) * d + along * (WIND.z / WIND.x)) % d);
      const yaw = noise(i, 9) * Math.PI,
        sx = 1.2 + noise(i, 10) * 1.3,
        sz = 1 + noise(i, 11) * 0.8;
      if (this.#lightClouds) this.#cloudData.set([x, z, 6 * sx, 4.6 * sz, yaw], i * 5);
      else swarm.put(i, x, 0.21, z, yaw, sx, 1, sz);
    }
    if (this.#lightClouds) {
      // The light rig draws them on everything; the decals stay empty.
      this.#lightClouds(this.#cloudData.subarray(0, count * 5));
      this.#cloudsShown = true;
    } else swarm.done(count);
  }

  #tickBirds(t: number, seconds: number) {
    const swarm = this.#birds,
      f = this.#flock;
    // Inside a building the camera is close: a bird passing overhead would be a big dark shard across the view.
    if (!this.enabled || this.#evening > 0.3 || this.#building) {
      swarm.done(0);
      return;
    }
    if (f.size === 0) {
      f.next -= seconds;
      if (f.next > 0) return;
      // A new flock: from one side of the town to the other, a little off the wind.
      const b = this.#ground;
      const k = Math.floor(t * 7.31);
      const angle = Math.atan2(WIND.z, WIND.x) + (noise(k, 12) - 0.5) * 1.2;
      f.dir.set(Math.cos(angle), 0, Math.sin(angle));
      const cx = (b.minX + b.maxX) / 2 + (noise(k, 13) - 0.5) * (b.maxX - b.minX) * 0.6,
        cz = (b.minZ + b.maxZ) / 2 + (noise(k, 14) - 0.5) * (b.maxZ - b.minZ) * 0.6;
      f.length = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) + 30;
      f.from.set(cx, 6.5 + noise(k, 15) * 2, cz).addScaledVector(f.dir, -f.length / 2);
      f.start = t;
      f.size = this.#settings.ambient === "reduced" ? 3 : 3 + Math.floor(noise(k, 16) * (FLOCK - 2));
    }
    const travelled = (t - f.start) * 4.2;
    if (travelled > f.length) {
      f.size = 0;
      f.next = (this.#settings.ambient === "reduced" ? 45 : 18) + noise(t, 17) * 25;
      swarm.done(0);
      return;
    }
    const yaw = Math.atan2(-f.dir.z, f.dir.x);
    for (let i = 0; i < f.size; i++) {
      // A loose V: the leader in front, the others behind and to either side.
      const rank = Math.ceil(i / 2),
        side = i % 2 ? 1 : -1;
      const back = rank * 0.9,
        out = rank * 0.75 * side;
      const x = f.from.x + f.dir.x * (travelled - back) - f.dir.z * out,
        z = f.from.z + f.dir.z * (travelled - back) + f.dir.x * out;
      const phase = t * 7 + i * 1.7;
      // Flap, then glide a moment now and then.
      const gliding = Math.sin(t * 0.9 + i) > 0.55;
      const flap = gliding ? 0.75 : Math.cos(phase);
      swarm.put(i, x, f.from.y + Math.sin(t * 1.3 + i) * 0.25 - rank * 0.15, z, yaw, 1, flap, 1);
    }
    swarm.done(f.size);
  }

  #tickButterflies(t: number) {
    const swarm = this.#butterflies,
      count = swarm.mesh.count;
    if (!count) return;
    for (let i = 0; i < count; i++) {
      const home = this.#beds[Math.floor(i / BUTTERFLIES_PER_BED)]!;
      const s = home.seed * 10 + i * 2.3;
      const a = 0.31 + noise(i, 18) * 0.2,
        c = 0.43 + noise(i, 19) * 0.2;
      // A lazy figure over the bed, dipping to the flowers and up again.
      const x = home.x + Math.sin(t * a + s) * 0.9,
        z = home.z + Math.sin(t * c + s * 1.3) * 0.6,
        y = home.y + 0.45 + Math.max(0, Math.sin(t * 0.7 + s)) * 0.5 + Math.sin(t * 5 + s) * 0.04;
      const dx = Math.cos(t * a + s) * a * 0.9,
        dz = Math.cos(t * c + s * 1.3) * c * 0.6;
      const fold = 0.2 + 0.8 * Math.abs(Math.sin(t * 13 + s * 3));
      const fade = this.#weight(i, this.#full.butterflies, 1 - smooth(this.#eveningNow, 0.25, 0.6));
      swarm.put(i, x, y, z, Math.atan2(-dz, dx), fade, fade, fold * fade);
    }
    swarm.done(count);
  }

  #tickFireflies(t: number) {
    const swarm = this.#fireflies,
      count = swarm.mesh.count;
    if (!count) return;
    for (let i = 0; i < count; i++) {
      const home = this.#glowers[i % this.#glowers.length]!;
      const s = home.seed * 20 + i * 1.9;
      const x = home.x + Math.sin(t * 0.23 + s) * 0.9 + Math.sin(t * 0.61 + s * 2) * 0.3,
        z = home.z + Math.cos(t * 0.19 + s) * 0.9,
        y = home.y + 0.45 + noise(i, 20) * 0.7 + Math.sin(t * 0.5 + s) * 0.2;
      // A slow blink: dark most of the time, a soft glow now and then, and a little larger while it glows.
      const pulse = Math.max(0, Math.sin(t * (0.8 + noise(i, 21) * 0.6) + s));
      const glow = pulse * pulse * pulse;
      const size = 0.75 + glow * 0.45;
      swarm.put(i, x, y, z, 0, size, size, size);
      swarm.shade(i, (0.08 + glow * 0.9) * this.#weight(i, this.#full.fireflies, smooth(this.#eveningNow, 0.45, 0.95)));
    }
    swarm.done(count, true);
  }

  #tickWindows(t: number) {
    const swarm = this.#windows,
      count = swarm.mesh.count;
    if (!count) return;
    // The windows brighten slowly through the dusk.
    const lit = smooth(this.#eveningNow, 0.05, 0.8);
    for (let i = 0; i < count; i++) {
      const spot = this.#windowSpots[i]!;
      swarm.put(i, spot.position.x, spot.position.y, spot.position.z, spot.yaw, 1, 1, 1);
      // Candle-like: a slow breath with a faint flicker, each window its own.
      const breath = 0.5 + 0.5 * Math.sin(t * (0.35 + noise(i, 22) * 0.3) + i * 2.1);
      const flicker = Math.sin(t * 9.7 + i * 5.3) * Math.sin(t * 6.1 + i) * 0.05;
      swarm.shade(i, (0.3 + breath * 0.35 + flicker) * lit);
    }
    swarm.done(count, true);
  }

  #tickRipples(t: number) {
    const swarm = this.#ripples,
      count = swarm.mesh.count,
      pond = this.#pond;
    if (!count || !pond) return;
    const night = this.#evening > 0.5;
    for (let i = 0; i < count; i++) {
      const period = 3.6;
      const cycle = (t + (i * period) / count) / period;
      const k = Math.floor(cycle),
        age = cycle - k;
      // A new spot on the water each cycle, kept inside the oval.
      const a = noise(k, i, 23) * Math.PI * 2,
        r = Math.sqrt(noise(k, i, 24)) * 0.6;
      const grow = 0.3 + age * 2.1;
      swarm.put(i, pond.x + Math.cos(a) * r * pond.rx, pond.y, pond.z + Math.sin(a) * r * pond.rz, 0, grow, 1, grow);
      swarm.shade(i, (1 - age) * (1 - age) * (night ? 0.25 : 0.32));
    }
    swarm.done(count, true);
  }

  #tickSteam(t: number) {
    const swarm = this.#steam,
      count = swarm.mesh.count;
    if (!count) return;
    for (let i = 0; i < count; i++) {
      const spot = this.#steamSpots[Math.floor(i / PUFFS_PER_SPOT)]!;
      // A chimney puffs big and slow; a cup a small curl.
      const big = spot.y > 2;
      const period = big ? 3.4 : 2.4;
      const age = ((t + ((i % PUFFS_PER_SPOT) * period) / PUFFS_PER_SPOT + spot.seed * 5) / period) % 1;
      const rise = age * (big ? 1.3 : 0.35);
      const fade = age < 0.7 ? 1 : (1 - age) / 0.3;
      const size = (big ? 0.5 + age * 1.6 : 0.18 + age * 0.35) * fade;
      const sway = Math.sin(t * 1.1 + i) * (big ? 0.12 : 0.03) + rise * (big ? 0.35 : 0.05);
      swarm.put(i, spot.x + sway * WIND.x, spot.y + rise, spot.z + sway * WIND.z, 0, size, size, size);
    }
    swarm.done(count);
  }

  #tickMotes(t: number) {
    const swarm = this.#motes,
      count = swarm.mesh.count,
      b = this.#building;
    if (!count || !b) return;
    for (let i = 0; i < count; i++) {
      const s = noise(i, 25) * 50;
      const x = b.minX + (b.maxX - b.minX) * (0.1 + 0.8 * noise(i, 26)) + Math.sin(t * 0.13 + s) * 0.6,
        z = b.minZ + (b.maxZ - b.minZ) * (0.1 + 0.8 * noise(i, 27)) + Math.cos(t * 0.11 + s) * 0.6,
        y = 0.9 + noise(i, 28) * 1.6 + Math.sin(t * 0.21 + s) * 0.3;
      swarm.put(i, x, y, z, 0, 1, 1, 1);
      swarm.shade(i, 0.25 + 0.35 * Math.max(0, Math.sin(t * 0.7 + s)));
    }
    swarm.done(count, true);
  }

  dispose() {
    for (const swarm of this.#swarms()) swarm.dispose();
    this.group.removeFromParent();
  }
}

/** Every `userData.life` marker under `root`, in world space: its kind, position and yaw. */
function spotsIn(root: THREE.Object3D, found: (life: LifeSpot, position: THREE.Vector3, yaw: number) => void) {
  root.updateMatrixWorld(true);
  const p = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3(),
    e = new THREE.Euler();
  root.traverse((o) => {
    const life = o.userData.life as LifeSpot | undefined;
    if (!life) return;
    o.matrixWorld.decompose(p, q, s);
    found(life, p.clone(), e.setFromQuaternion(q, "YXZ").y);
  });
}
