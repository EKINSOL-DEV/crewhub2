/* Round 43: one guard over the whole path the demo takes through the figures and the far crowd, so the next leak of
   round 41's kind (a far batch per emissive strength of the day-night drift) or round 42's (a see-through copy per
   faded figure, re-cloned at every look change) fails `npm test`. Every cast in the registry, on the Greenhouse kit the
   demo uses: the `Kit` built from style.json (the style's index needs Vite), the style's own `environment()` driving it
   the way TownScene does (`setDayPhase` with the drift's phases, `setTheme`), and `castRegistry.castFor` handed a style
   stub over `figureKit` so each cast is built as the demo builds it (colours folded, extensions, persons); a seeded timeline
   of look changes, faded flips, detail switches, figures coming and going, the crowd's frame at every step; after a
   warm-up through every state, light and theme, nothing may grow: the crowd's batches, the live materials, the faded
   copies (0 when no figure is faded), the geometries beyond what added figures bring, and the clones made (the churn).
   What is counted: three's own counters by probe (`new Material().id`, `new BufferGeometry().id`: every material and
   geometry made, of any kind), `MeshStandardMaterial.prototype.clone` (the crowd's white copies and twins, the faded
   copies), the `dispose` events of those clones, `fadedCopiesAlive()` and `crowd.group.children` (the InstancedMesh per
   batch). Deterministic: a seeded generator, no clock. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { everyState, type Cast, type FigureDetail, type FigureHandle, type FigureState } from "@crewhub/world-cast";
import type { StyleTheme } from "@crewhub/world-style";
import * as runtime from "../../world-cast/src/runtime.ts";
import { castRegistry } from "../../../apps/world/src/world/cast.ts";
import { RobotCrowd } from "../../../apps/world/src/world/robotCrowd.ts";
import { environment } from "../src/environment.ts";
import { figureKit } from "../src/figureKit.ts";
import { Kit, type GreenhouseManifestData } from "../src/kit.ts";

/* The real style's kit, as the demo has it: the style's own index needs Vite (import.meta.glob for the models, JSON
   imports), so this test lives in the style package and builds the Greenhouse kit from style.json as figurePieces.test
   does, drives it through the style's own environment (compileLights, driftLight, setLight: what TownScene's
   setDayPhase reaches) and hands the cast registry the kit the way the style's figureKit does. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as GreenhouseManifestData & { id: string; lighting: ConstructorParameters<typeof Kit>[1] };
/** The faded copies alive (round 42's runtime exports the counter; an older runtime has none, and the live-clone bound stands in). */
const fadedCopiesAlive = (): number | null => (typeof runtime.fadedCopiesAlive === "function" ? runtime.fadedCopiesAlive() : null);

/** mulberry32: a small seeded generator. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const THEMES: StyleTheme[] = ["day", "lamplight"];

/** The batches by what they draw: geometry, material kind, a decal's or a glowing part's own material, emissive. */
function describeBatches(crowd: RobotCrowd): Map<string, number> {
  const out = new Map<string, number>();
  for (const child of crowd.group.children as THREE.InstancedMesh[]) {
    const m = child.material as THREE.MeshStandardMaterial;
    const key = `${child.geometry.uuid.slice(0, 6)} ${m.type}${m.isMeshStandardMaterial ? ` emissive ${m.emissive.getHexString()} color ${m.color.getHexString()}` : ""}${child.instanceColor ? " tinted" : " own"}`;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}
function newBatches(before: Map<string, number>, now: Map<string, number>): string {
  const lines: string[] = [];
  for (const [k, n] of now) if ((before.get(k) ?? 0) < n) lines.push(`${k} x${n - (before.get(k) ?? 0)}`);
  return lines.join("; ");
}
const ROLES = ["lead", "worker", "worker", "analyst", "design", "operator", "worker", "postman"] as const;
const ACCENTS = [null, "coral", "sage", null] as const;
const STEPS = 3000;
const CHECK_EVERY = 100;
const START_PER_CAST = 6;

interface Figure {
  cast: string;
  key: string;
  handle: FigureHandle;
  state: FigureState;
  detail: FigureDetail;
}

/** The counters: materials and geometries made (three's ids), clones and their disposes. */
class Counters {
  clones = 0;
  disposedClones = 0;
  #clone = THREE.MeshStandardMaterial.prototype.clone;
  install() {
    const self = this;
    const clone = this.#clone;
    THREE.MeshStandardMaterial.prototype.clone = function () {
      self.clones++;
      const made = clone.call(this);
      made.addEventListener("dispose", () => self.disposedClones++);
      return made;
    };
  }
  restore() {
    THREE.MeshStandardMaterial.prototype.clone = this.#clone;
  }
  /** Every material made so far (of any kind): three's id counter, read with a probe. */
  materials(): number {
    // Every Material takes the next id at construction (three's own counter); the typings leave `id` out.
    return (new THREE.Material() as unknown as { id: number }).id;
  }
  geometries(): number {
    const g = new THREE.BufferGeometry();
    const id = g.id;
    g.dispose();
    return id;
  }
  get liveClones() {
    return this.clones - this.disposedClones;
  }
}

test(`every cast on the Greenhouse style, ${STEPS} demo-like steps: the crowd's batches, the live materials, the faded copies and the geometries stay bounded after the warm-up`, () => {
  const random = seeded(43);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const kit = new Kit(manifest, manifest.lighting);
  const style = { manifest: { id: manifest.id }, figureKit: (cast: Pick<import("@crewhub/world-cast").CastManifest, "id" | "colors">) => figureKit(kit, cast) };
  // The environment the demo's drift drives, wired as the style's index wires it; the renderer is only written to.
  const renderer = { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const env = environment(scene, renderer, manifest.lighting, "day", (t) => kit.setTheme(t), (q) => kit.setQuality(q), (light) => kit.setLight(light));
  const casts = new Map<string, Cast>(castRegistry.listCasts().map((m) => [m.id, castRegistry.castFor(style, m.id)]));
  assert.equal(casts.size, 4, "the four casts");
  const root = new THREE.Group();
  const crowd = new RobotCrowd();
  const counters = new Counters();
  counters.install();
  const figures: Figure[] = [];
  // Every figure the timeline will ever draw is made in the warm-up, by key (the key seeds a figure's colours and so its
  // kit materials and batches): WARM figures and WARM_PERSONS persons per cast; the timeline's additions take warmed keys
  // that are not alive, so no colour, material or batch can be new after the warm-up by construction.
  const WARM = 64, WARM_PERSONS = 12;
  const free = new Map<string, string[]>();
  const idle: FigureState = { activity: "idle", waiting: false, alert: false, proxy: false, carrying: false };
  const make = (cast: string, key: string): Figure => {
    const c = casts.get(cast)!;
    const n = Number(key.replace(/\D/g, ""));
    const handle = key.includes("p") ? c.person({ key: `guard:${cast}:${key}` }) : c.figure({ key: `guard:${cast}:${key}`, role: ROLES[n % ROLES.length]!, accent: ACCENTS[n % ACCENTS.length]! });
    handle.object.position.set((n % 12) * 1.1, 0.02, Math.floor(n / 12) * 1.3);
    handle.object.scale.setScalar(0.62);
    handle.setDetail("far");
    handle.setState(idle);
    root.add(handle.object);
    const f = { cast, key, handle, state: idle, detail: "far" as FigureDetail };
    figures.push(f);
    return f;
  };
  const add = (cast: string, person = false): Figure => {
    const pool = free.get(cast)!;
    const at = pool.findIndex((k) => k.includes("p") === person);
    assert.ok(at >= 0, `no warmed ${person ? "person" : "figure"} key left for ${cast}: raise WARM`);
    return make(cast, pool.splice(at, 1)[0]!);
  };
  const remove = (f: Figure) => {
    figures.splice(figures.indexOf(f), 1);
    f.handle.dispose();
    free.get(f.cast)!.push(f.key);
  };
  const frame = () => {
    root.updateMatrixWorld(true);
    crowd.begin();
    // As TownScene: the crowd draws the far figures; a near one (the entered building) draws on its own.
    for (const f of figures) if (f.detail === "far") crowd.add(f.handle.object, random() < 0.9, random() < 0.3);
    crowd.end();
  };
  const isFaded = (state: FigureState) => state.proxy || state.activity === "stale";
  /** Counted over the timeline: figures going faded (each needs its copies if nobody holds them) and look changes while faded. */
  let fadeIns = 0, fadedLooks = 0;
  const setState = (f: Figure, state: FigureState) => {
    if (isFaded(state) && !isFaded(f.state)) fadeIns++;
    else if (isFaded(state) && isFaded(f.state)) fadedLooks++;
    f.state = state;
    f.handle.setState(state);
  };
  const faded = () => figures.filter((f) => f.state.proxy || f.state.activity === "stale").length;
  let theme: StyleTheme = "day";
  let phase = 0;
  const drift = (step: number) => {
    // The demo's drift: a few times a second the light takes the clock's phase; at 16x capped to 4.4 days a day
    // (dayClock.ts), so the phase moves in small steps, never the same value twice.
    phase = (phase + 0.0007 + step * 1e-7) % 1;
    env.setDayPhase(phase);
  };

  try {
    for (const id of casts.keys()) {
      free.set(id, []);
      for (let i = 0; i < WARM; i++) make(id, `${i}`);
      for (let i = 0; i < WARM_PERSONS; i++) make(id, `p${i}`);
    }
    // The warm-up: every figure through every state near and far, under both themes and a full day of the drift.
    for (const t of THEMES) {
      theme = t;
      env.setTheme(t);
      for (const state of everyState()) {
        for (const f of figures) {
          setState(f, state);
          f.handle.setDetail((f.detail = "near"));
          f.handle.setDetail((f.detail = "far"));
        }
        frame();
      }
      for (let i = 0; i < 100; i++) {
        env.setDayPhase(i / 100);
        frame();
      }
    }
    // The timeline starts with a few figures and a person per cast; the rest wait in the pool.
    for (const f of [...figures]) {
      const n = Number(f.key.replace(/\D/g, ""));
      if (n >= (f.key.includes("p") ? 1 : START_PER_CAST)) remove(f);
    }
    // What one figure brings when its materials exist (its halo, its contact shadow): the allowance for figures added later.
    const m0 = counters.materials(), g0 = counters.geometries();
    const probe = add("classic-bots");
    const perFigureMaterials = counters.materials() - m0 - 1, perFigureGeometries = counters.geometries() - g0 - 1;
    remove(probe);
    for (const f of figures) setState(f, idle);
    frame();
    const warmBatches = describeBatches(crowd);
    const warm = { batches: crowd.group.children.length, liveClones: counters.liveClones, clones: counters.clones, materials: counters.materials(), geometries: counters.geometries(), faded: fadedCopiesAlive() ?? 0 };
    assert.equal(warm.faded, 0, "no figure is faded after the warm-up: no copy");
    fadeIns = 0;
    fadedLooks = 0;
    let added = 0;

    // The timeline.
    for (let step = 1; step <= STEPS; step++) {
      drift(step);
      const f = pick(figures);
      const roll = random();
      if (roll < 0.35) {
        // A look change: activity, waiting, alert, carrying.
        setState(f, { ...pick(everyState()), proxy: f.state.proxy });
      } else if (roll < 0.55) {
        // A faded flip: proxy on and off, stale on and off, both at once.
        const r = random();
        setState(f, r < 0.25 ? { ...f.state, proxy: !f.state.proxy } : r < 0.5 ? { ...f.state, activity: f.state.activity === "stale" ? "idle" : "stale" } : r < 0.75 ? { ...f.state, proxy: true, activity: "stale" } : { ...f.state, proxy: false, activity: "idle" });
      } else if (roll < 0.7) {
        f.handle.setDetail((f.detail = f.detail === "near" ? "far" : "near"));
      } else if (roll < 0.74 && figures.length > 8) {
        remove(f);
      } else if (roll < 0.78) {
        add(pick([...casts.keys()]), random() < 0.15);
        added++;
      } else if (roll < 0.8) {
        theme = theme === "day" ? "lamplight" : "day";
        env.setTheme(theme);
      }
      for (const g of figures) g.handle.update(0.05);
      frame();
      if (step % CHECK_EVERY === 0 || step === STEPS) {
        const at = `step ${step}`;
        assert.ok(crowd.group.children.length <= warm.batches, `${at}: batches ${crowd.group.children.length} > ${warm.batches} after the warm-up (a batch per value of something): new ${newBatches(warmBatches, describeBatches(crowd))}`);
        const copies = fadedCopiesAlive() ?? 0;
        assert.ok(counters.liveClones - copies <= warm.liveClones - warm.faded, `${at}: live clones beyond the faded copies ${counters.liveClones - copies} > ${warm.liveClones - warm.faded}`);
        if (faded() === 0) assert.equal(copies, 0, `${at}: no figure is faded, yet copies live`);
        if (fadedCopiesAlive() !== null) assert.ok(copies <= 3 * faded() * 12, `${at}: ${copies} faded copies for ${faded()} faded figures`);
        const nonClone = counters.materials() - warm.materials - counters.clones + warm.clones - Math.ceil(step / CHECK_EVERY);
        assert.ok(nonClone <= added * perFigureMaterials, `${at}: ${nonClone} materials made outside the clones beyond the ${added} added figures' ${perFigureMaterials} each`);
        assert.ok(counters.geometries() - warm.geometries - Math.ceil(step / CHECK_EVERY) <= added * perFigureGeometries, `${at}: geometries made beyond the added figures'`);
      }
    }
    // The churn: clones made over the timeline. Shared per kit material, a copy is made when a figure fades and nobody
    // holds its materials' copies (at most its ten parts), and a look change while faded clones at most the one or two
    // copies the look's new materials need; before round 42 every faded figure re-cloned all ten at every look change.
    const churn = counters.clones - warm.clones;
    const churnBound = 10 * fadeIns + 4 * fadedLooks;
    console.log(`  crowdBounded churn: ${churn} clones over ${STEPS} steps for ${fadeIns} fade-ins and ${fadedLooks} look changes while faded (bound ${churnBound})`);
    assert.ok(churn <= churnBound, `${churn} clones made over ${STEPS} steps for ${fadeIns} fade-ins and ${fadedLooks} look changes while faded: the faded copies are re-cloned, not shared`);
    // Everyone un-faded, then gone: no copy, and the batches are what the warm-up left.
    for (const f of figures) setState(f, idle);
    frame();
    assert.equal(fadedCopiesAlive() ?? 0, 0, "no figure is faded at the end: no copy");
    assert.ok(counters.liveClones <= warm.liveClones, `live clones at the end ${counters.liveClones} > ${warm.liveClones} after the warm-up`);
    for (const f of [...figures]) remove(f);
    assert.equal(fadedCopiesAlive() ?? 0, 0);
    crowd.dispose();
    env.dispose();
    console.log(`  crowdBounded: batches ${warm.batches}, clones ${warm.clones} in the warm-up and ${churn} over ${STEPS} steps, ${added} figures added, ${perFigureMaterials} materials and ${perFigureGeometries} geometries per figure`);
  } finally {
    counters.restore();
  }
});
