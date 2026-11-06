/* Design choice H3 (round 72, `stored-only`): the Connection panel offers "Forget this key" for the host's stored key
   only, as the Connect page does (ConnectPage.tsx, `source === "stored"`). A rejected key read from the old default
   file is not the host's to drop: the host never deletes a
   file outside its folder, so a Forget would bring the same rejected key back at the next `npm run world`. The panel
   says where that key comes from instead. A key from the environment's key file gets neither, as before. */
import assert from "node:assert/strict";
import test from "node:test";
import { forgetOffer } from "../src/state/connect.ts";

test("H3: Forget for the stored key only; the default file's key is named, the environment's is left alone", () => {
  assert.equal(forgetOffer({ state: "ok", source: "stored" }), "forget", "the stored key, accepted: Forget (as today)");
  assert.equal(forgetOffer({ state: "rejected", source: "stored" }), "forget", "the stored key, rejected: Forget");
  assert.equal(forgetOffer({ state: "rejected", source: "default" }), "default-file", "a rejected key from the old default file: where it comes from, no Forget");
  assert.equal(forgetOffer({ state: "ok", source: "default" }), null, "an accepted default-file key: nothing to do");
  assert.equal(forgetOffer({ state: "rejected", source: "env" }), null, "the environment's file: not the host's, as before");
  assert.equal(forgetOffer({ state: "ok", source: "env" }), null);
  assert.equal(forgetOffer({ state: "rejected" }), null, "a rejected key of unknown source (before pairing): no Forget, the Connect page's rule");
  assert.equal(forgetOffer({ state: "none" }), null);
  assert.equal(forgetOffer(undefined), null, "a host from before the smooth connection");
});
