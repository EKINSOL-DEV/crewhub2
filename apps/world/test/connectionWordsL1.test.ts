/* Design choice L1 (`own-words`, round 72): the two 503s of the host that are not loops have their own words in the
   chip and the panel: "Too many tabs" and "Host could not read loops" as the state, a hint that says what to do, and
   for host-failed the host's own reason, or a fallback when the host gave none. Pinned here word for word: round 73's
   mutation run changed each of the four with every test green. The strings are read from en.ts as connectOlder does
   (the i18n index is Vite's: an extensionless import); `fill` is the index's {var} rule. */
import assert from "node:assert/strict";
import test from "node:test";
import { EN } from "../src/i18n/en.ts";

const fill = (key: string, vars: Record<string, string> = {}): string => {
  let s = EN[key] ?? key;
  for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(vars[k]);
  return s;
};

test("L1: the two states' words", () => {
  assert.equal(fill("world.connection.host-tabs"), "Too many tabs");
  assert.equal(fill("world.connection.host-failed"), "Host could not read loops");
});

test("L1: the host-tabs hint says what to do, that loops is fine, and that the page keeps asking", () => {
  assert.equal(fill("world.connection.hint.host-tabs"), "This host has too many tabs open; close one. crewhub-loops is fine; the page keeps asking.");
});

test("L1: the host-failed hint carries the host's reason, and a fallback when it gave none", () => {
  assert.equal(fill("world.connection.hint.host-failed", { reason: "a read the allow-list refused" }), "The world's host could not read crewhub-loops: a read the allow-list refused");
  const none = fill("world.connection.hint.host-failed.none");
  assert.equal(none, "it gave no reason; its log says more.");
  assert.equal(fill("world.connection.hint.host-failed", { reason: none }), "The world's host could not read crewhub-loops: it gave no reason; its log says more.");
});
