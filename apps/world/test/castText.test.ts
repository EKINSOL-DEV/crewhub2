import assert from "node:assert/strict";
import test from "node:test";
import type { CastManifest } from "@crewhub/world-cast";
import type { AgentPlacement } from "@crewhub/world-model";
import { describeCasts } from "../src/world/castText.ts";
import { figureRole, figureState } from "../src/world/figureState.ts";

const names: Record<string, string> = { "classic-bots": "Classic bots", sprouts: "Sprouts" };
const registry = {
  listCasts: () => Object.entries(names).map(([id, name]) => ({ id, name }) as CastManifest),
  resolve(choice: { building?: string | null; viewer?: string | null; town?: string | null; style?: string | null }) {
    const unknown: string[] = [];
    for (const id of [choice.building, choice.viewer, choice.town, choice.style]) {
      if (!id) continue;
      if (id in names) return { id, unknown };
      unknown.push(id);
    }
    return { id: "classic-bots", unknown };
  },
};

test("the text view names the cast once, a building's own cast, and unknown ids in one note", () => {
  const text = (facts: Parameters<typeof describeCasts>[1]) => describeCasts(registry, facts).map((l) => l.text);
  assert.deepEqual(text({ viewer: null, town: undefined, plots: [], style: "classic-bots" }), ["Cast: Classic bots."]);
  assert.deepEqual(text({ viewer: "sprouts", town: undefined, plots: [{ slug: "hq" }, { slug: "lab", castId: "classic-bots" }], style: "classic-bots" }), ["Cast: Sprouts.", "Cast of lab: Classic bots."]);
  assert.deepEqual(text({ viewer: "elves", town: "ghosts", plots: [{ slug: "lab", castId: "elves" }], style: "classic-bots" }), [
    "Cast: Classic bots.",
    'No cast named "elves" or "ghosts" is installed; Classic bots stand in.',
  ]);
});

const agent = (change: Partial<AgentPlacement> = {}) => ({ role: "worker", posture: "relaxed", laneStatus: "idle", presence: "real", alerts: [], ...change }) as AgentPlacement;

test("the cast role: postmen at the post office, the operator in the town hall, else the agent's own role", () => {
  assert.equal(figureRole(agent({ role: "lead" }), "building"), "lead");
  assert.equal(figureRole(agent(), "building"), "worker");
  assert.equal(figureRole(agent({ role: "analyst" }), "post-office"), "postman");
  assert.equal(figureRole(agent(), "town-hall"), "operator");
  assert.equal(figureRole(agent({ role: "design" }), "town-hall"), "design");
});

test("the figure state follows the posture and the lane; walking wins; a proxy and an agent away from its desk idle", () => {
  const activity = (a: AgentPlacement, more = {}) => figureState({ agent: a, ...more }).activity;
  assert.equal(activity(agent({ posture: "focused" })), "working");
  assert.equal(activity(agent()), "idle");
  assert.equal(activity(agent({ laneStatus: "done" })), "done");
  assert.equal(activity(agent({ posture: "raised-hand" })), "blocked");
  assert.equal(activity(agent({ posture: "greyed" })), "stale");
  assert.equal(activity(agent({ posture: "raised-hand" }), { walker: { walking: true, seated: false } }), "walking");
  assert.equal(activity(agent({ posture: "focused" }), { walker: { walking: false, seated: false } }), "idle");
  assert.equal(activity(agent({ posture: "focused" }), { walker: { walking: false, seated: true } }), "working");
  assert.deepEqual(figureState({ agent: agent({ posture: "focused", presence: "proxy", alerts: ["stalled"] }), deskWaiting: true }), { activity: "idle", waiting: false, alert: true, proxy: true, carrying: false });
  assert.deepEqual(figureState({ agent: agent({ posture: "focused" }), deskWaiting: true, carrying: true }), { activity: "working", waiting: true, alert: false, proxy: false, carrying: true });
});
