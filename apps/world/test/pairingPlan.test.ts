import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expiryWords, pairingPlan } from "../src/state/pairing.ts";

describe("the tab's pairing at start", () => {
  it("a token in the URL is redeemed, a tab without a bearer asks the other tabs, a paired tab keeps its bearer", () => {
    assert.deepEqual(pairingPlan({ token: "t", bearer: null }), { step: "redeem", token: "t" });
    assert.deepEqual(pairingPlan({ token: "t", bearer: "b" }), { step: "redeem", token: "t" }, "a fresh link wins over an old bearer");
    assert.deepEqual(pairingPlan({ token: null, bearer: null }), { step: "ask" });
    assert.deepEqual(pairingPlan({ token: null, bearer: "b" }), { step: "keep" });
  });

  it("the expiry words: the host's days, nothing for never or unknown", () => {
    const t = (key: string, vars?: Record<string, string | number>) => `${key}:${vars?.["days"] ?? ""}`;
    assert.equal(expiryWords(30, t), "world.pair.expiry:30");
    assert.equal(expiryWords(0, t), "");
    assert.equal(expiryWords(undefined, t), "");
  });
});
