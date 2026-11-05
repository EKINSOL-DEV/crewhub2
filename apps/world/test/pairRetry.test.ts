/* The Pair screen's "I opened the link" (walk finding w2-7, round 65): a press asks the host again; when the read that
   landed after the press still leaves the Pair screen standing, a line under the button says the browser is still not
   paired. The rule is state/pairRetry.ts; the browser's pin is the regress connect group's row. */
import assert from "node:assert/strict";
import test from "node:test";
import { stillUnpaired } from "../src/state/pairRetry.ts";

test("no press yet: nothing to say, whatever the host answered", () => {
  assert.equal(stillUnpaired(null, null), false);
  assert.equal(stillUnpaired(null, { at: 1000 }), false);
});

test("a press waits for the read that lands after it; a read from before the press says nothing", () => {
  assert.equal(stillUnpaired(1000, null), false, "no read yet");
  assert.equal(stillUnpaired(1000, { at: 999 }), false, "a read from before the press");
  assert.equal(stillUnpaired(1000, { at: 1000 }), true, "a read that landed as the press came");
  assert.equal(stillUnpaired(1000, { at: 1500 }), true, "a read after the press");
});
