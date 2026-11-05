/* The Connection panel's sentence split around its crewhub-loops variable (round 65, w2-4), with the other names the
   host knows (round 68, mutation run mx1 over sugg/w2-4): the whole name with its underscores, only a loops variable,
   and the words after it without their leading space. */
import assert from "node:assert/strict";
import test from "node:test";
import { splitVariable } from "../src/state/discoveryLine.ts";

test("the name is the whole loops variable, underscores and all; words after it lose their leading space", () => {
  assert.deepEqual(splitVariable("through the folder in CREWHUB_WORLD_LOOPS_APP_DATA, as given"), { before: "through the folder in", name: "CREWHUB_WORLD_LOOPS_APP_DATA", after: ", as given" });
  assert.deepEqual(splitVariable("in CREWHUB_WORLD_LOOPS_URL and nothing else"), { before: "in", name: "CREWHUB_WORLD_LOOPS_URL", after: "and nothing else" });
});

test("a sentence naming another of the host's variables, not a loops one, is kept in one piece", () => {
  assert.equal(splitVariable("the port in CREWHUB_WORLD_PORT"), null);
  assert.equal(splitVariable("the folder in CREWHUB_WORLD_CONFIG_DIR"), null);
});
