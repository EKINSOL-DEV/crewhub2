/* Round 65 (walk finding w4-22): the Chat panel said nothing when loops was down; the chip said "Loops down" and the
   Connection panel "Stream down; the host retries", but the panel kept "Sign in to crewhub-loops below to type" and a
   frame that could not load. One line now stands at the top of the panel while loops is down, and in no other state. */
import assert from "node:assert/strict";
import test from "node:test";
import type { ConnectionState } from "@crewhub/loops-client";
import { chatStateLine } from "../src/state/chatPanel.ts";

test("the Chat panel's state line: the suggestion's words while loops is down, none in any other state (round 65, w4-22)", () => {
  assert.equal(chatStateLine("loops-down"), "crewhub-loops is not answering.");
  for (const state of ["connecting", "live", "catching-up", "stale", "unauthorized", "stream-busy", "unpaired"] as ConnectionState[]) assert.equal(chatStateLine(state), null, state);
});
