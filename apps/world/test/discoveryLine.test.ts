/* The Connection panel's crewhub-loops row (walk finding w2-4, round 65): the "found through …" sentence around its
   variable name, so the panel can set the name on a line of its own that never breaks mid-word, the target under it. */
import assert from "node:assert/strict";
import test from "node:test";
import { splitVariable } from "../src/state/discoveryLine.ts";
import { EN } from "../src/i18n/en.ts";

const en = (key: string): string => EN[key] ?? "";

test("the env-url and env-socket sentences split around their variable name, the words before it kept whole", () => {
  assert.deepEqual(splitVariable(en("world.connection.panel.via.env-url")), { before: "through the URL in", name: "CREWHUB_WORLD_LOOPS_URL", after: "" });
  assert.deepEqual(splitVariable(en("world.connection.panel.via.env-socket")), { before: "through the socket in", name: "CREWHUB_WORLD_LOOPS_SOCKET", after: "" });
});

test("words after the name are kept too", () => {
  assert.deepEqual(splitVariable("through CREWHUB_WORLD_LOOPS_URL, as given"), { before: "through", name: "CREWHUB_WORLD_LOOPS_URL", after: ", as given" });
});

test("the Mac app's roads name no variable: null, and the panel keeps the sentence in one piece", () => {
  assert.equal(splitVariable(en("world.connection.panel.via.app-socket")), null);
  assert.equal(splitVariable(en("world.connection.panel.via.app-port")), null);
  assert.equal(splitVariable(""), null);
});
