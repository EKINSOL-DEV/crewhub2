import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentOut } from "@crewhub/loops-client";
import { validateAgents, validateTeamSnapshot } from "../../loops-client/src/validate.ts";
import { DEMO_COMPUTER, laneOf, teamWithComputers, withLanes } from "../src/lanes.ts";
import { createDemoApi } from "../src/api.ts";
import { startDemo } from "./helpers.ts";

const NOW = new Date("2026-10-21T01:00:00Z");
const agent = (id: string, role = "lead"): AgentOut => ({ id, displayName: id, role, herdrSession: "ekinsol", disabled: false, lastSeenAt: null, keys: null, isCrewhubLead: id === "g-man", projects: { lead: [], member: [] }, lane: null, rights: [], revision: 1 });

test("the demo's agents carry lanes in loops' shape: desired and observed, drift where the story says, none for a probe", () => {
  const ids = ["g-man", "cr-lead", "cl-lead", "marky", "analyst", "ux-lead", "postman", "team-probe"];
  const out = withLanes(ids.map((id) => agent(id, id === "postman" ? "router" : id === "team-probe" ? "probe" : "lead")), NOW, (id) => (id === "cl-lead" ? "w2:p7" : null));
  const valid = validateAgents({ agents: out, lanesAuthority: "db", agentHome: null });
  assert.ok(valid.ok, valid.ok ? "" : `${valid.path}: ${valid.message}`);
  const by = (id: string) => out.find((a) => a.id === id)!;
  assert.deepEqual(by("cr-lead").lane?.drift, ["model"]);
  assert.equal(by("cr-lead").lane?.observed?.model, "claude-opus-5-5");
  assert.equal(by("cr-lead").lane?.desired.model, "claude-fable-5-1");
  assert.equal(by("cr-lead").lane?.observedAt, "2026-10-21T00:59:30.000Z");
  assert.deepEqual(by("analyst").lane?.drift, ["permissionMode"]);
  assert.equal(by("analyst").lane?.observed?.effort, null);
  assert.deepEqual(by("g-man").lane?.drift, []);
  assert.equal(by("g-man").lane?.observed?.source, "started");
  assert.equal(by("marky").lane?.observed, null);
  assert.equal(by("marky").lane?.drift, null);
  assert.equal(by("marky").lane?.restarting, true);
  assert.equal(by("ux-lead").lane?.lifecycle, "closed");
  assert.equal(by("ux-lead").needsLoginSince, "2026-10-21T00:20:00.000Z");
  assert.equal(by("ux-lead").notPickedUp, 3);
  assert.equal(by("team-probe").lane, null);
  assert.deepEqual(by("cl-lead").computer, DEMO_COMPUTER);
  assert.equal(by("cl-lead").external, false);
  // The pane is the team's when it knows the agent, else the agent's place in the list.
  assert.equal(by("cl-lead").lane?.pane, "w2:p7");
  assert.equal(by("cr-lead").lane?.pane, "w1:p2");
  assert.equal(out.length, 8);
  // An external bot (the world's own key on a live installation): the flag kept, no lane, no login or mail flags.
  const bot = withLanes([{ ...agent("crewhub-world"), herdrSession: "external:none", external: true }], NOW)[0]!;
  assert.equal(bot.external, true);
  assert.equal(bot.lane, null);
  assert.equal(bot.needsLoginSince, null);
  assert.equal(bot.notPickedUp, 0);
  assert.deepEqual(bot.computer, DEMO_COMPUTER);
  // An agent of another scenario gets the default lane, deterministic.
  const fn = laneOf(agent("fn-lead"), "w1:p4", NOW);
  assert.deepEqual(laneOf(agent("fn-lead"), "w1:p4", NOW), fn);
  assert.equal(fn?.pane, "w1:p4");
  assert.deepEqual(fn?.drift, []);
});

test("the demo's team names a computer on every session", () => {
  const team = teamWithComputers({ v: 1, ts: "2026-10-21T01:00:00Z", sessions: [{ name: "ekinsol", agents: [{ name: "cl-lead", status: "working" }] }] });
  assert.ok(validateTeamSnapshot(team).ok);
  assert.deepEqual(team.sessions[0]?.computer, DEMO_COMPUTER);
  assert.deepEqual(teamWithComputers({ v: 1, ts: "", sessions: [] }).sessions, []);
});

test("the demo source serves its agents with lanes, the pane the team runs them in, and the same answer at the same position", async () => {
  const run = startDemo();
  const agents = await run.source.getAgents();
  const valid = validateAgents({ agents });
  assert.ok(valid.ok, valid.ok ? "" : `${valid.path}: ${valid.message}`);
  const by = (id: string) => agents.find((a) => a.id === id)!;
  assert.deepEqual(by("cr-lead").lane?.drift, ["model"]);
  assert.equal(by("cl-lead").lane?.pane, "w2:p7", "the pane of cl-lead in the demo's team (workspace w2, the seventh lane)");
  assert.equal(by("cl-lead").lane?.session, "ekinsol");
  assert.equal(by("team-probe").lane, null);
  assert.ok(agents.every((a) => a.computer?.kind === "this"));
  // Deterministic: the same demo position answers the same facts (the observed stamp follows the demo clock).
  assert.deepEqual(await startDemo().source.getAgents(), agents);
  assert.equal(by("cr-lead").lane?.observedAt, new Date(run.source.now() - 30_000).toISOString());
  const snapshot = run.messages[0];
  assert.equal(snapshot?.type, "snapshot");
  if (snapshot?.type === "snapshot") {
    assert.ok(snapshot.snapshot.agents.some((a) => a.lane !== null), "the snapshot's agents carry the lanes too");
    assert.deepEqual(snapshot.snapshot.team.sessions[0]?.computer, DEMO_COMPUTER);
  }
  // The demo API answers as loops does: the list, who decides the lanes, and no agents' home for a key.
  const api = createDemoApi(run.source);
  const reply = (await api.handle("GET", "/api/agents")).body as { agents: AgentOut[]; lanesAuthority: string; agentHome: null };
  assert.equal(reply.lanesAuthority, "db");
  assert.equal(reply.agentHome, null);
  assert.equal(reply.agents.length, agents.length);
});
