import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentOut } from "@crewhub/loops-client";
import { validateAgents } from "../../loops-client/src/validate.ts";
import { withKeyBot } from "../src/lanes.ts";

const NOW = new Date("2026-10-21T01:00:00Z");
const agent = (id: string): AgentOut => ({ id, displayName: id, role: "lead", herdrSession: "ekinsol", disabled: false, lastSeenAt: null, keys: null, isCrewhubLead: false, projects: { lead: [], member: [] }, lane: null, rights: [], revision: 1 });

test("the fake lists the key's principal as the external bot it is, once, in no project", () => {
  const out = withKeyBot([agent("cr-lead")], "crewhub-world", NOW);
  const valid = validateAgents({ agents: out, lanesAuthority: "db", agentHome: null });
  assert.ok(valid.ok, valid.ok ? "" : `${valid.path}: ${valid.message}`);
  assert.equal(out.length, 2);
  const bot = out[1]!;
  assert.equal(bot.id, "crewhub-world");
  assert.equal(bot.external, true);
  assert.equal(bot.herdrSession, "external:none");
  assert.equal(bot.lane, null);
  assert.equal(bot.lastSeenAt, NOW.toISOString());
  assert.deepEqual(bot.projects, { lead: [], member: [] });
  assert.deepEqual(bot.computer, { name: "This computer", kind: "this" });
  // Not twice when the demo lists it already.
  assert.equal(withKeyBot([agent("crewhub-world")], "crewhub-world", NOW).length, 1);
});
