/* A viewer's settings (state/setting.ts) through their one interface: every setting a page keeps in this browser, one row
   each. Round 60, pg-P1: "storage may throw: the choice lasts for this page only" was spelt out in nine modules and
   tested in four (details, fps, daynight, roleOverrides); it is one fact here, over every setting. The keys are literal
   on purpose: the tools set them too (tools/lib/world.mjs `castChoice`, perf.mjs, memory.mjs, regress.mjs). */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { ambient } from "../src/state/ambient.ts";
import { buildingPlan, DEFAULT_BUILDING_PLAN } from "../src/state/buildingPlan.ts";
import { cast } from "../src/state/cast.ts";
import { dayNight } from "../src/state/daynight.ts";
import { details } from "../src/state/details.ts";
import { fps } from "../src/state/fps.ts";
import { oldQuarter } from "../src/state/oldQuarter.ts";
import { quality } from "../src/state/quality.ts";
import { createSetting, onOff, oneOfChoices, storedValue, toggle, type StoredValue } from "../src/state/setting.ts";
import { styleOptions } from "../src/state/styleOptions.ts";

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}
const throwing = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

/** Runs `fn` with `globalThis.localStorage` as given: a value, or a getter that throws as a blocked site's does. */
function withLocalStorage<T>(descriptor: PropertyDescriptor, fn: () => T): T {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, ...descriptor });
  try {
    return fn();
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

interface Row<T> {
  setting: StoredValue<T>;
  key: string;
  /** What nothing stored reads as. */
  none: T;
  value: T;
  /** The text `value` is stored as. */
  text: string;
}
const row = <T,>(r: Row<T>) => r as unknown as Row<unknown>;
const ROWS = [
  row({ setting: details, key: "crewhub-world.details", none: false, value: true, text: "on" }),
  row({ setting: fps, key: "crewhub-world.fps", none: false, value: true, text: "on" }),
  row({ setting: oldQuarter, key: "crewhub-world.old-quarter", none: false, value: true, text: "on" }),
  row({ setting: cast, key: "crewhub-world.cast", none: null, value: "potlings", text: "potlings" }),
  row({ setting: quality, key: "crewhub-world.quality", none: "pretty", value: "fast", text: "fast" }),
  row({ setting: ambient, key: "crewhub-world.ambient", none: "on", value: "reduced", text: "reduced" }),
  row({ setting: dayNight, key: "crewhub-world.daynight", none: null, value: false, text: "off" }),
  row({ setting: buildingPlan, key: "crewhub-world.building-plan", none: DEFAULT_BUILDING_PLAN, value: "classic", text: "classic" }),
  row({ setting: styleOptions, key: "crewhub-world.style-options", none: {}, value: { season: "spring" }, text: '{"season":"spring"}' }),
];

for (const { setting, key, none, value, text } of ROWS) {
  test(`${key}: kept under its key; nothing stored, no storage, a storage that throws or a localStorage that throws reads the default, and a write there never throws`, () => {
    assert.equal(setting.key, key);
    const store = memory();
    assert.deepEqual(setting.read(store), none, "nothing stored");
    setting.write(value, store);
    assert.equal(store.data.get(key), text, "stored as the tools write it");
    assert.deepEqual(setting.read(store), value, "read back");
    assert.deepEqual(setting.read(memory({ [key]: text })), value, "a value a tool set");
    assert.deepEqual(setting.read(null), none, "no storage at all");
    assert.deepEqual(setting.read(throwing), none, "a storage that throws");
    assert.deepEqual(setting.read(() => { throw new Error("blocked"); }), none, "a storage that cannot even be asked");
    assert.doesNotThrow(() => setting.write(value, throwing));
    assert.doesNotThrow(() => setting.write(value, null));
    withLocalStorage({ get: () => { throw new Error("blocked"); } }, () => {
      assert.deepEqual(setting.read(), none, "reading localStorage itself throws");
      assert.doesNotThrow(() => setting.write(value));
    });
    const page = memory();
    withLocalStorage({ value: page }, () => {
      setting.write(value);
      assert.equal(page.data.get(key), text, "the page's localStorage when none is named");
      assert.deepEqual(setting.read(), value);
      assert.deepEqual(setting.read(null), none, "null is nowhere, though the page has a localStorage");
      page.data.delete(key);
      setting.write(value, null);
      assert.equal(page.data.has(key), false, "a write to nowhere stays there");
    });
  });
}

test("the parse rules that are more than a word: an unknown choice reads as the default; a cast of nothing is none; only a flat object of strings is kept", () => {
  assert.equal(quality.read(memory({ [quality.key]: "ultra" })), "pretty");
  assert.equal(ambient.read(memory({ [ambient.key]: "loud" })), "on");
  assert.equal(cast.read(memory({ [cast.key]: "" })), null);
  assert.equal(dayNight.read(memory({ [dayNight.key]: "maybe" })), null);
  assert.equal(details.read(memory({ [details.key]: "yes" })), false);
  assert.equal(buildingPlan.read(memory({ [buildingPlan.key]: "three" })), "three-rooms");
  assert.equal(buildingPlan.read(memory({ [buildingPlan.key]: "four" })), DEFAULT_BUILDING_PLAN);
  assert.deepEqual(styleOptions.read(memory({ [styleOptions.key]: '{"season":"spring","planting":"","n":3}' })), { season: "spring" });
  assert.deepEqual(styleOptions.read(memory({ [styleOptions.key]: "not json" })), {});
});

test("a value of none removes the key: a cast that follows the town, no style options, a day and night unset", () => {
  for (const [setting, value] of [[cast, null], [styleOptions, {}], [dayNight, null]] as [StoredValue<unknown>, unknown][]) {
    const store = memory({ [setting.key]: "was" });
    setting.write(value, store);
    assert.equal(store.data.has(setting.key), false, setting.key);
  }
});

test("the page's value: read once and kept; set keeps it, stores it and tells the listeners, in that order; a storage that throws keeps it for this page", () => {
  const store = memory({ k: "on" });
  const setting = createSetting<boolean>({ key: "k", ...onOff });
  withLocalStorage({ value: store }, () => {
    assert.equal(setting.now(), true);
    store.data.set("k", "off");
    assert.equal(setting.now(), true, "read once");
    const heard: [boolean, string | undefined][] = [];
    const stop = setting.subscribe(() => heard.push([setting.now(), store.data.get("k")]));
    store.data.set("k", "on");
    setting.set(false);
    assert.deepEqual(heard, [[false, "off"]], "the listener finds the value kept and stored");
    assert.equal(toggle(setting), true);
    assert.equal(store.data.get("k"), "on");
    stop();
    setting.set(false);
    assert.equal(heard.length, 2, "a stopped listener hears nothing");
  });
  withLocalStorage({ get: () => { throw new Error("blocked"); } }, () => {
    const blocked = createSetting<boolean>({ key: "k", ...onOff });
    assert.equal(blocked.now(), false);
    assert.doesNotThrow(() => blocked.set(true));
    assert.equal(blocked.now(), true, "kept for this page only");
    assert.equal(toggle(blocked), false);
  });
  const none = createSetting<string | null>({ key: "n", parse: (text) => text, format: (value) => value });
  let reads = 0;
  withLocalStorage({ value: { getItem: () => (reads += 1, null) } }, () => {
    assert.equal(none.now(), null);
    assert.equal(none.now(), null);
    assert.equal(reads, 1, "a value of null is a value: read once, not on every render");
  });
});

test("use() hands React one subscribe for the setting's life, render after render, so a store never re-subscribes on a render (round 30's churn, state/media.ts)", () => {
  // No DOM renderer here: React's own slot for the current renderer's hooks stands in for one. Its name says a React upgrade
  // may move it; this test then fails loudly, and the fact needs a new pin.
  const internals = (React as unknown as Record<string, { H: unknown }>)["__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE"]!;
  const was = internals.H;
  const given: unknown[] = [];
  internals.H = { useSyncExternalStore: (subscribe: unknown, snapshot: () => unknown) => (given.push(subscribe), snapshot()) };
  try {
    const setting = createSetting<boolean>({ key: "u", ...onOff });
    assert.equal(setting.use(), false);
    setting.use();
    setting.use();
    assert.equal(given.length, 3);
    assert.ok(given.every((subscribe) => subscribe === setting.subscribe), "the one subscribe, each render");
  } finally {
    internals.H = was;
  }
});

test("the override wins over storage for the page, until the viewer sets the value; the Buildings setting's is the address bar's ?rooms=", () => {
  const store = memory({ o: "b" });
  let word: string | null = "a";
  const setting = createSetting<string>({ key: "o", ...oneOfChoices(["a", "b", "c"], "c"), override: () => word });
  assert.equal(setting.read(store), "a");
  word = null;
  assert.equal(setting.read(store), "b", "no override: the stored one");
  word = "a";
  withLocalStorage({ value: store }, () => {
    assert.equal(setting.now(), "a");
    setting.set("c");
    assert.equal(setting.now(), "c", "the viewer's choice replaces the override on this page");
    assert.equal(store.data.get("o"), "c");
  });
  const had = Object.getOwnPropertyDescriptor(globalThis, "location");
  const at = (search: string) => Object.defineProperty(globalThis, "location", { configurable: true, value: { search } });
  try {
    const stored = memory({ [buildingPlan.key]: "classic" });
    at("?rooms=three");
    assert.equal(buildingPlan.read(stored), "three-rooms", "the URL wins");
    at("?rooms=classic");
    assert.equal(buildingPlan.read(null), "classic", "the URL needs no storage");
    assert.equal(buildingPlan.read(throwing), "classic");
    at("?rooms=four");
    assert.equal(buildingPlan.read(stored), "classic", "anything else leaves the setting alone");
  } finally {
    if (had) Object.defineProperty(globalThis, "location", had);
    else delete (globalThis as { location?: unknown }).location;
  }
});

test("storedValue is the read and the write alone: a storage given as a function is asked each time, inside the try", () => {
  const store = memory();
  let asked = 0;
  const value = storedValue<number>({ key: "n", parse: (text) => (text === null ? 0 : JSON.parse(text)), format: (n) => String(n) });
  const from = () => ((asked += 1), store);
  value.write(3, from);
  assert.equal(value.read(from), 3);
  assert.equal(asked, 2);
  store.data.set("n", "{not json");
  assert.equal(value.read(from), 0, "a parse that throws reads as nothing stored");
  assert.deepEqual(Object.keys(value).sort(), ["key", "read", "write"]);
});
