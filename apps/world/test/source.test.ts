import assert from "node:assert/strict";
import test from "node:test";
import type { HostHealth } from "@crewhub/loops-client";
import { decideSource, DEFAULT_LOOPS_URL, hrefWithoutOverride, LIVE_TOWN_KEY, loopsWebUrl, needsProbe, parseSourceOverride, parseSourceSetting, PROBE_TIMEOUT_MS, readSourceSetting, resolveSource, SOURCE_SETTING_KEY, townKeyFor, writeSourceSetting } from "../src/state/source.ts";

const HEALTH: HostHealth = { loops: "ok", keyName: "crewhub-world", sharedKey: false };

test("parsing: only the three settings and the two overrides count", () => {
  assert.equal(parseSourceSetting("live"), "live");
  assert.equal(parseSourceSetting("demo"), "demo");
  assert.equal(parseSourceSetting("auto"), "auto");
  assert.equal(parseSourceSetting(null), "auto");
  assert.equal(parseSourceSetting("stress"), "auto");
  assert.equal(parseSourceOverride("live"), "live");
  assert.equal(parseSourceOverride("auto"), null);
  assert.equal(parseSourceOverride(undefined), null);
});

test("resolve: the URL wins, then a fixed setting, then the probe", () => {
  assert.deepEqual(resolveSource({ override: "demo", setting: "live", probed: true }), { source: "demo", reason: "url" });
  assert.deepEqual(resolveSource({ override: null, setting: "live", probed: false }), { source: "live", reason: "setting" });
  assert.deepEqual(resolveSource({ override: null, setting: "demo", probed: true }), { source: "demo", reason: "setting" });
  assert.deepEqual(resolveSource({ override: null, setting: "auto", probed: true }), { source: "live", reason: "probe-answered" });
  assert.deepEqual(resolveSource({ override: null, setting: "auto", probed: false }), { source: "demo", reason: "probe-silent" });
});

test("only auto without an override asks the host", () => {
  assert.equal(needsProbe({ override: null, setting: "auto" }), true);
  assert.equal(needsProbe({ override: "live", setting: "auto" }), false);
  assert.equal(needsProbe({ override: null, setting: "demo" }), false);
});

test("decide: auto probes with the timeout and goes live on an answer", async () => {
  let asked: number | null = null;
  const decision = await decideSource({
    param: null,
    setting: null,
    probe: async (ms) => {
      asked = ms;
      return HEALTH;
    },
  });
  assert.equal(asked, PROBE_TIMEOUT_MS);
  assert.equal(decision.source, "live");
  assert.equal(decision.reason, "probe-answered");
  assert.equal(decision.health, HEALTH);
});

test("decide: a silent or failing probe is the demo, quietly", async () => {
  const silent = await decideSource({ param: null, setting: null, probe: async () => null });
  assert.equal(silent.source, "demo");
  assert.equal(silent.reason, "probe-silent");
  const failing = await decideSource({
    param: null,
    setting: "auto",
    probe: async () => {
      throw new Error("no network");
    },
  });
  assert.equal(failing.source, "demo");
  assert.equal(failing.health, null);
});

test("decide: a fixed setting or a URL override never probes", async () => {
  const probe = async () => {
    throw new Error("must not be asked");
  };
  assert.equal((await decideSource({ param: null, setting: "live", probe })).source, "live");
  assert.equal((await decideSource({ param: "demo", setting: "live", probe })).source, "demo");
  assert.equal((await decideSource({ param: "live", setting: "demo", probe })).source, "live");
});

test("the town document key: live has its own, the demo keeps the scenario's and the stress fixture's", () => {
  assert.equal(townKeyFor({ source: "live", scenarioTownKey: "crewhub-world.studio", stressSize: null }), LIVE_TOWN_KEY);
  assert.equal(townKeyFor({ source: "live", scenarioTownKey: "crewhub-world", stressSize: 20 }), LIVE_TOWN_KEY);
  assert.equal(townKeyFor({ source: "demo", scenarioTownKey: "crewhub-world.studio", stressSize: null }), "crewhub-world.studio");
  assert.equal(townKeyFor({ source: "demo", scenarioTownKey: "crewhub-world", stressSize: 20 }), "crewhub-world.stress-20");
  assert.notEqual(LIVE_TOWN_KEY, "crewhub-world");
});

test("the setting in storage: auto is the absence of a value; a broken storage is auto", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  assert.equal(readSourceSetting(storage), "auto");
  writeSourceSetting("live", storage);
  assert.equal(store.get(SOURCE_SETTING_KEY), "live");
  assert.equal(readSourceSetting(storage), "live");
  writeSourceSetting("auto", storage);
  assert.equal(store.has(SOURCE_SETTING_KEY), false);
  const broken = {
    getItem: () => {
      throw new Error("SecurityError");
    },
  };
  assert.equal(readSourceSetting(broken), "auto");
  assert.equal(readSourceSetting(null), "auto");
});

test("the href without the override keeps the other parameters", () => {
  assert.equal(hrefWithoutOverride({ pathname: "/", search: "?source=live&scenario=studio" }), "/?scenario=studio");
  assert.equal(hrefWithoutOverride({ pathname: "/", search: "?source=demo" }), "/");
});

test("the sign-in link: the host's loopsWebUrl when it names one, else the default", () => {
  assert.equal(loopsWebUrl(null), DEFAULT_LOOPS_URL);
  assert.equal(loopsWebUrl(HEALTH), DEFAULT_LOOPS_URL);
  assert.equal(loopsWebUrl({ ...HEALTH, loopsWebUrl: "http://localhost:8091" }), "http://localhost:8091");
  assert.equal(loopsWebUrl({ ...HEALTH, loopsWebUrl: "javascript:alert(1)" }), DEFAULT_LOOPS_URL);
});
