/* The page, read once (state/page.ts): what a page's address, build and source decision decide. Round 59d, C3: the
   scenario picker's facts (once scenarioChoices.ts, folded in) and the facts world.ts read at import (stress, the
   building limit, the scenario, the source, the town keys). */
import assert from "node:assert/strict";
import test from "node:test";
import { STRESS_FIXTURES } from "@crewhub/demo";
import { readPageConfig } from "../src/state/page.ts";
import { LIVE_TOWN_KEY, type SourceDecision } from "../src/state/source.ts";

const DEMO: SourceDecision = { source: "demo", setting: "auto", override: null, health: null, reason: "probe-silent" };
const page = (search: string, options: { pathname?: string; dev?: boolean; decision?: SourceDecision } = {}) =>
  readPageConfig({ search, pathname: options.pathname ?? "/", dev: options.dev ?? false, decision: options.decision ?? DEMO });

test("scenarioChoices: every scenario, the shown one current, hrefs on this page without scenario or stress, the default without ?scenario; the stress fixtures only in dev", () => {
  const params = new URLSearchParams("scenario=one&stress=12&rooms=three");
  const plain = page(params.toString(), { pathname: "/w" }).scenarioChoices;
  assert.deepEqual(
    plain.map((c) => [c.id, c.current, c.href]),
    [
      ["fresh", false, "/w?rooms=three&scenario=fresh"],
      ["one", true, "/w?rooms=three&scenario=one"],
      ["small-team", false, "/w?rooms=three"],
      ["studio", false, "/w?rooms=three&scenario=studio"],
    ],
  );
  assert.equal(page("").scenarioChoices.find((c) => c.id === "small-team")?.href, "/", "no query: no ?");
  const dev = page(params.toString(), { pathname: "/w", dev: true }).scenarioChoices;
  assert.deepEqual(
    dev.slice(4).map((c) => [c.id, c.name, c.summary, c.current, c.href]),
    [
      ["stress-12", "Stress 12", `${STRESS_FIXTURES[12].agents} agents`, true, "/w?rooms=three&stress=12"],
      ["stress-20", "Stress 20", `${STRESS_FIXTURES[20].agents} agents`, false, "/w?rooms=three&stress=20"],
    ],
  );
  assert.deepEqual(dev.slice(0, 4).map((c) => c.current), [false, false, false, false], "a stress fixture shown: no scenario is current");
});

test("the address bar's flags: stress and the building limit only in dev builds; the scenario by id, the default without one", () => {
  const prod = page("?stress=20&buildings=3&scenario=studio");
  assert.deepEqual([prod.stressSize, prod.stress, prod.buildingLimit, prod.scenario.id], [null, false, NaN, "studio"]);
  const dev = page("?stress=20&buildings=3.7", { dev: true });
  assert.deepEqual([dev.stressSize, dev.stress, dev.buildingLimit, dev.scenario.id], [20, true, 3, "small-team"]);
  assert.equal(page("?buildings=-2", { dev: true }).buildingLimit, 0);
  assert.ok(Number.isNaN(page("?buildings=lots", { dev: true }).buildingLimit));
  assert.equal(page("?stress=7", { dev: true }).stressSize, null, "only the fixtures' sizes");
});

test("the source and the town keys: a demo page keeps its scenario's (or its stress fixture's) town; a live page the installation's, copied once from the plain live key", () => {
  const demo = page("?scenario=studio");
  assert.deepEqual([demo.live, demo.source, demo.townKey, demo.townCopyFrom], [false, DEMO, demo.scenario.townKey, null]);
  assert.equal(page("?stress=12", { dev: true }).townKey, "crewhub-world.stress-12");
  const health = { loops: "ok", keyName: "k", sharedKey: false, pairing: "on", paired: true, loopsWebUrl: "http://127.0.0.1:8091" } as unknown as NonNullable<SourceDecision["health"]>;
  const live = page("?scenario=studio", { decision: { ...DEMO, source: "live", health } });
  assert.deepEqual([live.live, live.townKey, live.townCopyFrom], [true, `${LIVE_TOWN_KEY}.127.0.0.1-8091`, LIVE_TOWN_KEY]);
  const plain = page("", { decision: { ...DEMO, source: "live" } });
  assert.deepEqual([plain.townKey, plain.townCopyFrom], [LIVE_TOWN_KEY, null]);
});
