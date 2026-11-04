import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expiryWords, pairingRowWords } from "../src/state/pairing.ts";

const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars?.["days"] === undefined ? "" : `:${vars["days"]}`}`;

describe("the pairing's words (round 31, question 2: the idle expiry)", () => {
  it("the Pair screen's expiry sentence: the host's days; nothing for never or a host from before the window", () => {
    assert.equal(expiryWords(30, t), "world.pair.expiry:30");
    assert.equal(expiryWords(7, t), "world.pair.expiry:7");
    assert.equal(expiryWords(0, t), "");
    assert.equal(expiryWords(undefined, t), "");
  });

  it("the Connection panel's Pairing row: the cookie and its window; never; off in development; an older host says no window", () => {
    assert.equal(pairingRowWords({ pairing: "on", pairingIdleDays: 30 }, t), "world.connection.panel.pairing.browserworld.connection.panel.pairing.expiry:30");
    assert.equal(pairingRowWords({ pairing: "on", pairingIdleDays: 0 }, t), "world.connection.panel.pairing.browserworld.connection.panel.pairing.never");
    assert.equal(pairingRowWords({ pairing: "off", pairingIdleDays: 30 }, t), "world.connection.panel.pairing.off");
    assert.equal(pairingRowWords({ pairing: "on" }, t), "world.connection.panel.pairing.browser");
    assert.equal(pairingRowWords(null, t), "world.connection.panel.pairing.browser");
  });
});
