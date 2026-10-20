import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentOut } from "@crewhub/loops-client";
import { validateAgents, validateTeamSnapshot } from "../../loops-client/src/validate.ts";
import { agentsWithLanes, laneOf, teamWithComputers } from "../src/lanes.ts";

const NOW = new Date("2026-10-21T01:00:00Z");
const agent = (id: string, role = "lead"): AgentOut => ({ id, displayName: id, role, herdrSession: "ekinsol", disabled: false, lastSeenAt: null, keys: null, isCrewhubLead: id === "g-man", projects: { lead: [], member: [] }, lane: null, rights: [], revision: 1 });

test("the fake's agents carry lanes in loops' shape: desired and observed, drift where the story says, none for a probe", () => {
  const out = agentsWithLanes(["g-man", "cr-lead", "cl-lead", "marky", "analyst", "ux-lead", "postman", "team-probe"].map((id) => agent(id, id === "postman" ? "router" : id === "team-probe" ? "probe" : "lead")), "crewhub-world", NOW);
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
  assert.deepEqual(by("cl-lead").computer, { name: "This computer", kind: "this" });
  assert.equal(by("cl-lead").external, false);
  // The key's principal is listed as the external bot it is, as the development instance really answers.
  const bot = by("crewhub-world");
  assert.equal(bot.external, true);
  assert.equal(bot.herdrSession, "external:none");
  assert.equal(bot.lane, null);
  assert.equal(bot.lastSeenAt, NOW.toISOString());
  assert.deepEqual(bot.projects, { lead: [], member: [] });
  assert.equal(out.length, 9);
  const withProject = agentsWithLanes([{ ...agent("cr-lead"), projects: { lead: [{ slug: "creator", key: "CR" }], member: [] } }], "crewhub-world", NOW);
  assert.deepEqual(withProject[1]?.projects, { lead: [], member: [{ slug: "creator", key: "CR" }] });
  // Not twice when the demo lists it already; an agent of another scenario gets the default lane, deterministic.
  assert.equal(agentsWithLanes([agent("crewhub-world")], "crewhub-world", NOW).length, 1);
  const fn = laneOf(agent("fn-lead"), 3, NOW);
  assert.deepEqual(laneOf(agent("fn-lead"), 3, NOW), fn);
  assert.equal(fn?.pane, "w1:p4");
  assert.deepEqual(fn?.drift, []);
});

test("the fake's team names a computer on every session", () => {
  const team = teamWithComputers({ v: 1, ts: "2026-10-21T01:00:00Z", sessions: [{ name: "ekinsol", agents: [{ name: "cl-lead", status: "working" }] }] });
  assert.ok(validateTeamSnapshot(team).ok);
  assert.deepEqual(team.sessions[0]?.computer, { name: "This computer", kind: "this" });
  assert.deepEqual(teamWithComputers({ v: 1, ts: "", sessions: [] }).sessions, []);
});
