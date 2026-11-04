/* The director runtime (state/director.ts) through its interface: built from a config over a fake world, a storage in
   memory, a recording intent player and a navigation world, read through `state`, `subscribe`, `start` and `update`.
   Round 59d, C3: the facts once pinned on presenceStore.ts and directorState.ts (folded in) are here: the settings kept
   under their key and read back normalised, defaults when nothing, unreadable or a blocked storage; the state published
   only when something is new (settings, mode, switch, plans by identity; the usage by value). */
import assert from "node:assert/strict";
import test from "node:test";
import { createDemoSource, createManualScheduler } from "@crewhub/demo";
import { DEFAULT_PRESENCE, type WorldModel } from "@crewhub/world-model";
import { NavWorld } from "../src/world/navigation.ts";
import { createDirectorRuntime, PRESENCE_KEY, type DirectorRuntimeConfig } from "../src/state/director.ts";
import { createWorldRuntime, type FrameClock } from "../src/state/world.ts";
import { world as fixtureWorld } from "./fixtures.ts";

/** A Storage in memory; `broken` makes every call throw, as a blocked site's does. */
function storage(broken = false) {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key: string) {
      if (broken) throw new Error("blocked");
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (broken) throw new Error("blocked");
      data.set(key, value);
    },
  };
}

/** A world the test moves by hand: `show(model)` is a new model and every listener hears it. */
function handWorld(model: WorldModel) {
  const listeners = new Set<() => void>();
  const w = {
    state: { model, text: [], playback: null },
    subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
    show(next: WorldModel) {
      w.state = { ...w.state, model: next };
      for (const l of listeners) l();
    },
  };
  return w;
}

function make(options: { store?: ReturnType<typeof storage> | null; model?: WorldModel; world?: DirectorRuntimeConfig["world"] } = {}) {
  const store = options.store === undefined ? storage() : options.store;
  const world = handWorld(options.model ?? fixtureWorld([]));
  const played: string[] = [];
  let cleared = 0;
  let navs = 0;
  const director = createDirectorRuntime({
    world: options.world ?? world,
    storage: () => store,
    intents: { play: (intent) => void played.push(intent.kind), clear: () => void (cleared += 1) },
    nav: () => ((navs += 1), new NavWorld()),
    buildingPlan: () => "three-rooms",
  });
  return { director, world, store, played, cleared: () => cleared, navs: () => navs };
}

test("the settings: kept under their key and read back normalised; nothing stored, unreadable or a blocked storage reads the defaults", () => {
  const s = storage();
  assert.deepEqual(make({ store: s }).director.state.settings, DEFAULT_PRESENCE, "nothing stored");
  make({ store: s }).director.update({ directorEnabled: true, intervalMinutes: 5 });
  assert.deepEqual(JSON.parse(s.data.get(PRESENCE_KEY)!), { ...DEFAULT_PRESENCE, directorEnabled: true, intervalMinutes: 5 });
  assert.deepEqual(make({ store: s }).director.state.settings, { ...DEFAULT_PRESENCE, directorEnabled: true, intervalMinutes: 5 }, "a new page reads them back");
  s.data.set(PRESENCE_KEY, JSON.stringify({ ...DEFAULT_PRESENCE, intervalMinutes: 1 }));
  assert.equal(make({ store: s }).director.state.settings.intervalMinutes, 2, "normalised: the plan's minimum");
  s.data.set(PRESENCE_KEY, "{not json");
  assert.deepEqual(make({ store: s }).director.state.settings, DEFAULT_PRESENCE, "unreadable");
  const blocked = make({ store: storage(true) });
  assert.deepEqual(blocked.director.state.settings, DEFAULT_PRESENCE, "a storage that throws");
  assert.doesNotThrow(() => blocked.director.update({ directorEnabled: true }));
  assert.equal(blocked.director.state.settings.directorEnabled, true, "kept for this page only");
  assert.deepEqual(make({ store: null }).director.state.settings, DEFAULT_PRESENCE, "no storage at all");
});

test("publishing: an update is new settings; a model that changes nothing publishes nothing; the mode of the first live model does", () => {
  const { director, world } = make();
  let heard = 0;
  director.subscribe(() => (heard += 1));
  director.start();
  director.start();
  assert.equal(heard, 0, "the first demo model: the same settings, mode, switch, plans and usage");
  world.show(fixtureWorld([]));
  assert.equal(heard, 0, "another model, nothing planned and the same usage (by value): nothing");
  const before = director.state;
  director.update({});
  assert.equal(heard, 1, "an update: new settings, though equal in value");
  assert.notEqual(director.state.settings, before.settings);
  world.show({ ...fixtureWorld([]), mode: "live" });
  assert.equal(heard, 2);
  assert.equal(director.state.mode, "live");
  assert.equal(director.state.enabled, false, "the live switch is its own, off by default");
});

test("off, the director costs no graph work and clears every intent; on in the demo, its accepted intents are played", async () => {
  const { director, world, cleared, navs } = make();
  director.start();
  world.show(fixtureWorld([]));
  assert.equal(navs(), 0, "a switched-off director never makes its navigation world");
  director.update({ directorEnabled: false });
  assert.equal(cleared(), 1, "the kill switch clears the intents at once");
  // The real demo world, with the director on: its plans' accepted intents reach the player.
  const scheduler = createManualScheduler(0);
  const demo = createDemoSource({ scheduler, epochMs: 0 });
  const clock: FrameClock = { now: () => 0, frame: (fn) => fn(), after: (ms, fn) => void setTimeout(fn, ms), every: () => {}, hidden: () => false };
  const real = createWorldRuntime({ source: demo, chat: demo, epochMs: 0, clock, buildingLimit: NaN, outlets: { said: () => {}, threads: () => {}, hostConnected: () => {}, firstSnapshot: () => {} } });
  const on = make({ world: real });
  on.director.update({ directorEnabled: true, intervalMinutes: 2 });
  on.director.start();
  for (let i = 0; i < 40 && on.played.length === 0; i += 1) {
    scheduler.advance(30_000);
    await new Promise((resolve) => setTimeout(resolve, 5));
    real.setRoleOverrides({});
  }
  assert.equal(on.navs(), 1, "made once, the first time the director asks");
  assert.ok(on.played.length > 0, "an accepted intent was played");
  assert.ok(on.director.state.plans.length > 0, "the plan log");
  assert.equal(on.director.state.enabled, true);
});
