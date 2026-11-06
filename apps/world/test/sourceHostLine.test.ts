/* Design choice T8 (round 72, `answered`): Settings › Source shows the host's address only once a host has answered.
   A demo page whose host never answered has no health, so the "Host: …" line is not there; a page with any health
   (live, or the demo chosen over a host that answered) keeps it, with the key's name as before. */
import assert from "node:assert/strict";
import test from "node:test";
import type { HostHealth } from "@crewhub/loops-client";
import { hostAnswered } from "../src/state/source.ts";

const HEALTH: HostHealth = { loops: "ok", keyName: "crewhub-world", sharedKey: false };

test("T8: the host line waits for a host that answered", () => {
  assert.equal(hostAnswered(null), false, "no health: a demo page without a host says nothing about one");
  assert.equal(hostAnswered(HEALTH), true, "a host answered: its address and key");
  assert.equal(hostAnswered({ ...HEALTH, loops: "down", keyName: "" }), true, "a host that answered with loops down still names itself");
});
