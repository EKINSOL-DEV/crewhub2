/* After a successful connect the world is said to be live, once (round 65, walk finding w5-22): "Key sent to the host;
   checking it with crewhub-loops." was said, then the town took the Connect screen's place and said only "Opening
   CrewHub…"; the Live chip is never announced on a fresh load, so a screen reader person heard the check start and never
   its end. state/connectSaid.ts: the Connect screen marks the connect, the town takes the mark once it is live and
   says "Connected: Live." instead of the change sentence; a change over an open town is said as before; the first
   state of a plain load is not. */
import assert from "node:assert/strict";
import test from "node:test";
import { connectionSentence, markConnected, takeConnected } from "../src/state/connectSaid.ts";

test("the mark is taken once", () => {
  assert.equal(takeConnected(), false, "nothing marked");
  markConnected();
  assert.equal(takeConnected(), true);
  assert.equal(takeConnected(), false, "taken once");
});

test("which sentence a connection state asks for", () => {
  assert.equal(connectionSentence(false, null, "live"), null, "a plain load's first state is not said");
  assert.equal(connectionSentence(false, null, "connecting"), null);
  assert.equal(connectionSentence(true, null, "live"), "connected", "the first live state after a connect is said as a connect");
  assert.equal(connectionSentence(true, "connecting", "live"), "connected", "and not also as a change");
  assert.equal(connectionSentence(false, "live", "loops-down"), "changed", "a change over an open town, as before");
  assert.equal(connectionSentence(false, "loops-down", "live"), "changed");
  assert.equal(connectionSentence(false, "live", "live"), null, "the same state again says nothing");
  assert.equal(connectionSentence(false, "live", null), null);
});
