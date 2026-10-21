import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHECKOUT_ID_LENGTH, checkoutId } from "../src/checkout.ts";

describe("the checkout id", () => {
  it("is 12 hex characters of the root's real path: the same root the same id, another root another, never the path", () => {
    const realpath = (p: string) => p.replace("/link", "/real");
    const a = checkoutId("/Users/me/crewhub2", realpath);
    assert.match(a, new RegExp(`^[0-9a-f]{${CHECKOUT_ID_LENGTH}}$`));
    assert.equal(checkoutId("/Users/me/crewhub2/", realpath), a, "a trailing separator is the same root");
    assert.equal(checkoutId("/Users/me/link/../crewhub2", () => "/Users/me/crewhub2"), a, "resolved through realpath");
    assert.notEqual(checkoutId("/Users/me/crewhub2-task-x", realpath), a);
    assert.equal(checkoutId("/Users/me/link", realpath), checkoutId("/Users/me/real", realpath), "a symlinked root is its target");
    assert.ok(!a.includes("crewhub"), "no path in the id");
  });

  it("falls back to the path as given when realpath fails (a root that is not there yet)", () => {
    const fails = () => {
      throw new Error("ENOENT");
    };
    assert.equal(checkoutId("/nowhere/x", fails), checkoutId("/nowhere/x/", fails));
  });
});

describe("health's checkout", () => {
  it("is the id the host was given, before the pairing gate (any page may ask whose host this is)", async () => {
    const { createHost } = await import("../src/host.ts");
    const host = await createHost({ loopsUrl: "http://127.0.0.1:1", checkout: "9f2c1a7b3d4e", retryMs: { min: 20, max: 100 }, log: () => undefined });
    try {
      const health = (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, unknown>;
      assert.equal(health.checkout, "9f2c1a7b3d4e");
      assert.equal(health.paired, false, "asked without a cookie");
    } finally {
      await host.close();
    }
  });
});
