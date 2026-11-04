/* The smallest pure steps moved out of the state modules no node test can load (round 56, r56-state-small): world.ts's
   agent name and scenario picker, town.ts's change test, chat.ts's snapshot keys and Settings route, and director.ts's
   publish test. */
import assert from "node:assert/strict";
import test from "node:test";
import { STRESS_FIXTURES, type FeedUsage } from "@crewhub/demo";
import { DEFAULT_PRESENCE } from "@crewhub/world-model";
import { agentDisplayName } from "../src/state/agentName.ts";
import { opensSettings, snapshotInvalidations } from "../src/state/chatInvalidations.ts";
import { sameDirectorState, type DirectorState } from "../src/state/directorState.ts";
import { scenarioChoicesFor } from "../src/state/scenarioChoices.ts";
import { invalidChanged } from "../src/state/townEdits.ts";
import type { InvalidRequest } from "../src/world/propImport.ts";
import { agent, building, world } from "./fixtures.ts";

test("agentDisplayName: an agent's name in a building, the town hall or the post office; null for one the model does not place", () => {
  const model = world([building("cr", [agent("cr-dev-1", "workers", { displayName: "Ada" })])], {
    townHall: [agent("g-man", "lead-office", { displayName: "G-Man" })],
    postOffice: [agent("postman", "lobby", { displayName: "Postman" })],
  });
  assert.equal(agentDisplayName(model, "cr-dev-1"), "Ada");
  assert.equal(agentDisplayName(model, "g-man"), "G-Man");
  assert.equal(agentDisplayName(model, "postman"), "Postman");
  assert.equal(agentDisplayName(model, "Ada"), null, "by the agent's name (its id), not its display name");
  assert.equal(agentDisplayName(model, "nobody"), null);
});

test("invalidChanged: the visible error crates differ from the shown ones by count or by the request at any place, never by equal values", () => {
  const crate = (ticketKey: string) => ({ ticketKey, error: `${ticketKey} is not a valid prop` }) as unknown as InvalidRequest;
  const a = crate("CR-1");
  const b = crate("CR-2");
  assert.equal(invalidChanged([a, b], [a, b]), false, "the same requests in the same order");
  assert.equal(invalidChanged([], []), false);
  assert.equal(invalidChanged([a], [a, b]), true, "one fewer");
  assert.equal(invalidChanged([a, b], [a]), true, "one more");
  assert.equal(invalidChanged([a, b], [b, a]), true, "another order");
  assert.equal(invalidChanged([a, crate("CR-2")], [a, b]), true, "another object at a place, though equal in value");
});

test("snapshotInvalidations: a snapshot refreshes the threads, the messages, the summary and the agents, as a new list each time", () => {
  assert.deepEqual(snapshotInvalidations(), [["dm-threads"], ["dm-messages"], ["dm-summary"], ["agents"]]);
  assert.notEqual(snapshotInvalidations(), snapshotInvalidations());
});

test("opensSettings: only a route under /settings opens the Settings card", () => {
  assert.equal(opensSettings("/settings"), true);
  assert.equal(opensSettings("/settings/agents/connect"), true);
  assert.equal(opensSettings("/agents"), false);
  assert.equal(opensSettings("/x/settings"), false);
  assert.equal(opensSettings(""), false);
});

test("sameDirectorState: nothing new while settings, mode, switch and plans are the same objects and the usage the same values", () => {
  const usage = (plansTotal: number) => ({ plansToday: 0, plansThisHour: 0, plansTotal, intentsAccepted: 0, intentsRejected: 0, inputTokens: 0 }) as FeedUsage;
  const plans: DirectorState["plans"] = [];
  const base: DirectorState = { settings: DEFAULT_PRESENCE, mode: "demo", enabled: false, plans, usage: usage(1) };
  assert.equal(sameDirectorState(base, { ...base }), true);
  assert.equal(sameDirectorState(base, { ...base, usage: usage(1) }), true, "the usage compared by value");
  assert.equal(sameDirectorState(base, { ...base, usage: usage(2) }), false);
  assert.equal(sameDirectorState(base, { ...base, settings: { ...DEFAULT_PRESENCE } }), false, "new settings, though equal in value");
  assert.equal(sameDirectorState(base, { ...base, mode: "live" }), false);
  assert.equal(sameDirectorState(base, { ...base, enabled: true }), false);
  assert.equal(sameDirectorState(base, { ...base, plans: [] }), false, "a new plan list, though empty too");
});

test("scenarioChoicesFor: every scenario, the shown one current, hrefs on this page without scenario or stress, the default without ?scenario; the stress fixtures only in dev", () => {
  const params = new URLSearchParams("scenario=one&stress=12&rooms=three");
  const plain = scenarioChoicesFor({ params, pathname: "/w", scenarioId: "one", stressSize: null, dev: false });
  assert.deepEqual(
    plain.map((c) => [c.id, c.current, c.href]),
    [
      ["fresh", false, "/w?rooms=three&scenario=fresh"],
      ["one", true, "/w?rooms=three&scenario=one"],
      ["small-team", false, "/w?rooms=three"],
      ["studio", false, "/w?rooms=three&scenario=studio"],
    ],
  );
  assert.equal(params.toString(), "scenario=one&stress=12&rooms=three", "the page's own query is left as it is");
  assert.equal(scenarioChoicesFor({ params: new URLSearchParams(""), pathname: "/", scenarioId: "small-team", stressSize: null, dev: false }).find((c) => c.id === "small-team")?.href, "/", "no query: no ?");
  const dev = scenarioChoicesFor({ params, pathname: "/w", scenarioId: "one", stressSize: 12, dev: true });
  assert.deepEqual(
    dev.slice(4).map((c) => [c.id, c.name, c.summary, c.current, c.href]),
    [
      ["stress-12", "Stress 12", `${STRESS_FIXTURES[12].agents} agents`, true, "/w?rooms=three&stress=12"],
      ["stress-20", "Stress 20", `${STRESS_FIXTURES[20].agents} agents`, false, "/w?rooms=three&stress=20"],
    ],
  );
  assert.deepEqual(dev.slice(0, 4).map((c) => c.current), [false, false, false, false], "a stress fixture shown: no scenario is current");
});
