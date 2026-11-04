import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHECKOUT_ID_LENGTH, answerFromHealth, checkoutId, probeCheckout } from "../src/checkout.ts";

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
    const { testHost } = await import("./testHost.ts");
    const host = await testHost({ loopsUrl: "http://127.0.0.1:1", checkout: "9f2c1a7b3d4e", retryMs: { min: 20, max: 100 }, log: () => undefined });
    try {
      const health = (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, unknown>;
      assert.equal(health.checkout, "9f2c1a7b3d4e");
      assert.equal(health.paired, false, "asked without a cookie");
    } finally {
      await host.close();
    }
  });
});

describe("what a port answers a dev server", () => {
  // Whether a port's answer is a host's at all, and whether its checkout looks like an id, is the road's to say
  // (runningHost.test.ts, `probe`, through the wire's reader); here only the two facts the verdict reads.
  it("a host's health as the verdict's answer: the id (null on a host from before it) and the key's name", () => {
    assert.deepEqual(answerFromHealth({ loops: "ok", keyName: "crewhub-world", sharedKey: false, checkout: "9f2c1a7b3d4e" }), { kind: "host", checkout: "9f2c1a7b3d4e", keyName: "crewhub-world" });
    assert.deepEqual(answerFromHealth({ loops: "down", keyName: "", sharedKey: false }), { kind: "host", checkout: null, keyName: "" });
  });

  it("the probe: a host with its id, and silence where nothing listens", async () => {
    const { testHost } = await import("./testHost.ts");
    const host = await testHost({ loopsUrl: "http://127.0.0.1:1", checkout: "9f2c1a7b3d4e", retryMs: { min: 20, max: 100 }, log: () => undefined });
    try {
      assert.deepEqual(await probeCheckout(host.port), { kind: "host", checkout: "9f2c1a7b3d4e", keyName: "" });
    } finally {
      await host.close();
    }
    assert.deepEqual(await probeCheckout(host.port, 500), { kind: "silent" }, "closed: nothing answers");
  });

  it("the probe: what answers but is not a host (another service's health) is not a host", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    try {
      assert.deepEqual(await probeCheckout((server.address() as { port: number }).port), { kind: "not-a-host" });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
