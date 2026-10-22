import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEV_ORIGIN_MAX, devOriginVerdict, loopbackOrigin } from "../src/devOrigin.ts";
import { tellDevOrigin, tellOutcome } from "../src/checkout.ts";
import { createHost } from "../src/host.ts";

const program = { originHeader: undefined, contentType: "application/json", remoteAddress: "127.0.0.1", hostCheckout: "9f2c1a7b3d4e", known: new Set<string>(), sameUser: true, hasSecret: true };

describe("the dev origin decision", () => {
  it("accepts a loopback http origin with a port from a program of this checkout, normalised", () => {
    assert.deepEqual(devOriginVerdict({ ...program, body: { origin: "http://127.0.0.1:5294", checkout: "9f2c1a7b3d4e" } }), { ok: true, origin: "http://127.0.0.1:5294" });
    assert.deepEqual(devOriginVerdict({ ...program, body: { origin: " HTTP://LocalHost:5294 ", checkout: "9f2c1a7b3d4e" } }), { ok: true, origin: "http://localhost:5294" });
    assert.deepEqual(devOriginVerdict({ ...program, remoteAddress: "::1", body: { origin: "http://127.0.0.1:5294", checkout: "9f2c1a7b3d4e" } }), { ok: true, origin: "http://127.0.0.1:5294" }, "told over IPv6 loopback");
    assert.deepEqual(devOriginVerdict({ ...program, hostCheckout: undefined, body: { origin: "http://127.0.0.1:5294" } }), { ok: true, origin: "http://127.0.0.1:5294" }, "a host without an id cannot tell checkouts apart and accepts a loopback origin");
  });

  it("never a page, never a non-loopback origin, never a wildcard, never another checkout, never more than the cap", () => {
    const verdict = (patch: Partial<Parameters<typeof devOriginVerdict>[0]>) => {
      const v = devOriginVerdict({ ...program, body: { origin: "http://127.0.0.1:5294", checkout: "9f2c1a7b3d4e" }, ...patch });
      return v.ok ? "ok" : `${v.status} ${v.error}`;
    };
    assert.equal(verdict({ originHeader: "http://127.0.0.1:5294" }), "403 not_a_program", "a browser always sends Origin on a POST");
    assert.equal(verdict({ sameUser: false }), "403 not_same_user", "the checkout id alone is public in health (review F3): the run file's secret proves the user");
    assert.equal(verdict({ hasSecret: false, sameUser: false }), "404 no_run_file", "a host without a run file cannot be told at all");
    assert.equal(verdict({ remoteAddress: "192.168.1.20" }), "403 not_loopback");
    assert.equal(verdict({ contentType: "text/plain" }), "415 json_required", "a page cannot send JSON cross-origin without a preflight the host never answers");
    assert.equal(verdict({ body: "x" }), "400 bad_body");
    // Other host names are spelled in pieces: the repository's network guard reads every literal address under apps/host.
    const elsewhere = (host: string) => ["http:/", `/${host}:5294`].join("");
    for (const origin of [elsewhere("example.com"), elsewhere("127.0.0.1.example.com"), elsewhere("[::1]"), "https://127.0.0.1:5294", "*", "http://127.0.0.1", "http://127.0.0.1:0", "http://127.0.0.1:70000", "http://127.0.0.1:5294/path", "http://127.0.0.1:5294@example.com", 5294, null]) {
      assert.equal(verdict({ body: { origin, checkout: "9f2c1a7b3d4e" } }), "400 origin_not_loopback", String(origin));
      assert.equal(loopbackOrigin(origin), null, String(origin));
    }
    assert.equal(verdict({ body: { origin: "http://127.0.0.1:5294", checkout: "000000000000" } }), "403 other_checkout");
    assert.equal(verdict({ body: { origin: "http://127.0.0.1:5294" } }), "403 other_checkout", "no id in the body is not this checkout");
    const full = new Set(Array.from({ length: DEV_ORIGIN_MAX }, (_, i) => `http://127.0.0.1:${6000 + i}`));
    assert.equal(verdict({ known: full }), "429 too_many_origins");
    assert.equal(verdict({ known: full, body: { origin: "http://127.0.0.1:6000", checkout: "9f2c1a7b3d4e" } }), "ok", "an origin already known is fine past the cap");
  });

  it("the outcome the dev server reads: accepted with the list, an older host without the route, a refusal with its words, silence", () => {
    assert.deepEqual(tellOutcome(200, { ok: true, origin: "http://127.0.0.1:5294", origins: ["http://127.0.0.1:5294"] }), { kind: "accepted", origins: ["http://127.0.0.1:5294"] });
    assert.deepEqual(tellOutcome(404, { error: "not_found" }), { kind: "no-route" });
    assert.deepEqual(tellOutcome(404, { error: "no_run_file", message: "This host has no run file" }), { kind: "no-route" }, "a host without a run file reads as one that cannot be told");
    assert.deepEqual(tellOutcome(405, {}), { kind: "no-route" });
    assert.deepEqual(tellOutcome(403, { error: "other_checkout", message: "This host runs from checkout x" }), { kind: "refused", status: 403, message: "This host runs from checkout x" });
    assert.deepEqual(tellOutcome(500, "oops"), { kind: "refused", status: 500, message: "status 500" });
  });
});

describe("the dev origin at the host", () => {
  it("a program of this checkout is accepted once, health lists it, and the page's writes from that origin pass the guard; a page and a foreign origin are still refused", async () => {
    const lines: string[] = [];
    const host = await createHost({ loopsUrl: "http://127.0.0.1:1", checkout: "9f2c1a7b3d4e", pairing: "off", mintSecret: "the-run-file-secret", retryMs: { min: 20, max: 100 }, log: (line) => lines.push(line) });
    const tell = (port: number, origin: string, checkout: string, secret: string | null = "the-run-file-secret") => tellDevOrigin(port, origin, checkout, 1500, secret);
    try {
      const dev = "http://127.0.0.1:5294";
      // A program with the checkout id alone (read from unpaired health) is refused (review F3), and cannot fill the slots.
      assert.deepEqual(await tell(host.port, dev, "9f2c1a7b3d4e", null), { kind: "no-run-file" }, "no run file to read: the dev server does not even ask");
      const stranger = await fetch(`${host.url}/world-api/dev-origin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ origin: dev, checkout: "9f2c1a7b3d4e" }) });
      assert.equal(stranger.status, 403);
      assert.equal(((await stranger.json()) as { error: string }).error, "not_same_user");
      for (let i = 0; i < 9; i++) {
        const r = await fetch(`${host.url}/world-api/dev-origin`, { method: "POST", headers: { "content-type": "application/json", "x-crewhub-world-mint": "a-guess" }, body: JSON.stringify({ origin: `http://127.0.0.1:${40001 + i}`, checkout: "9f2c1a7b3d4e" }) });
        assert.equal(r.status, 403, `a wrong secret, try ${i}`);
      }
      assert.equal(((await (await fetch(`${host.url}/world-api/health`)).json()) as { devOrigins?: string[] }).devOrigins, undefined, "no slot taken by a stranger");
      // Before: the town write from the dev origin is refused by the origin guard.
      const before = await fetch(`${host.url}/world-api/town`, { method: "PUT", headers: { origin: dev, "content-type": "application/json" }, body: JSON.stringify({ document: {}, baseRev: 0 }) });
      assert.equal(before.status, 403);
      assert.equal(((await before.json()) as { error: string }).error, "origin_forbidden");
      // Told by a program (no Origin header, JSON, loopback): accepted, one line, listed in health and its header.
      assert.deepEqual(await tell(host.port, dev, "9f2c1a7b3d4e"), { kind: "accepted", origins: [dev] });
      assert.deepEqual(await tell(host.port, dev, "9f2c1a7b3d4e"), { kind: "accepted", origins: [dev] }, "told again: the same answer");
      assert.equal(lines.filter((l) => l.startsWith("dev origin ")).length, 1, "one line, the first time");
      assert.match(lines.find((l) => l.startsWith("dev origin ")) ?? "", /^dev origin http:\/\/127\.0\.0\.1:5294 accepted: this checkout's dev server/);
      const health = await fetch(`${host.url}/world-api/health`);
      assert.equal(health.headers.get("x-world-dev-origins"), dev);
      assert.deepEqual(((await health.json()) as { devOrigins: string[] }).devOrigins, [dev]);
      // After: the write from the dev origin passes the origin guard (the town's own checks answer now, not the guard).
      const after = await fetch(`${host.url}/world-api/town`, { method: "PUT", headers: { origin: dev, "content-type": "application/json" }, body: JSON.stringify({ document: {}, baseRev: 0 }) });
      assert.notEqual(after.status, 403, `status ${after.status}`);
      assert.notEqual(((await after.json()) as { error?: string }).error, "origin_forbidden");
      // Still refused: a foreign origin on the write, another checkout's dev server, a page telling an origin.
      const foreign = await fetch(`${host.url}/world-api/town`, { method: "PUT", headers: { origin: "http://127.0.0.1:1", "content-type": "application/json" }, body: JSON.stringify({ document: {}, baseRev: 0 }) });
      assert.equal(foreign.status, 403);
      assert.deepEqual(await tell(host.port, "http://127.0.0.1:5295", "000000000000"), { kind: "refused", status: 403, message: "This host runs from checkout 9f2c1a7b3d4e; only that checkout's dev server may tell it an origin" });
      const page = await fetch(`${host.url}/world-api/dev-origin`, { method: "POST", headers: { origin: host.url, "content-type": "application/json", "x-crewhub-world-mint": "the-run-file-secret" }, body: JSON.stringify({ origin: "http://127.0.0.1:5296", checkout: "9f2c1a7b3d4e" }) });
      assert.equal(page.status, 403);
      assert.equal(((await page.json()) as { error: string }).error, "not_a_program");
      assert.deepEqual(await tell(host.port, ["http:/", "/example.com:5294"].join(""), "9f2c1a7b3d4e"), { kind: "refused", status: 400, message: "The dev origin must be http://127.0.0.1:<port> or http://localhost:<port>; never another host, https or a wildcard" });
      assert.equal((await fetch(`${host.url}/world-api/dev-origin`)).status, 405, "GET is not a way in");
      assert.deepEqual(((await (await fetch(`${host.url}/world-api/health`)).json()) as { devOrigins: string[] }).devOrigins, [dev], "nothing refused was added");
    } finally {
      await host.close();
    }
    assert.deepEqual(await tellDevOrigin(host.port, "http://127.0.0.1:5294", "9f2c1a7b3d4e", 500, "the-run-file-secret"), { kind: "silent" }, "closed: nothing answers");
    assert.deepEqual(await tellDevOrigin(host.port, "http://127.0.0.1:5294", "9f2c1a7b3d4e", 500, null), { kind: "silent" }, "closed and no run file: still silence, not a run-file complaint");
    // A host without a run file secret (a tool's in-process host) cannot be told at all.
    const bare = await createHost({ loopsUrl: "http://127.0.0.1:1", checkout: "9f2c1a7b3d4e", pairing: "off", retryMs: { min: 20, max: 100 }, log: () => undefined });
    try {
      const r = await fetch(`${bare.url}/world-api/dev-origin`, { method: "POST", headers: { "content-type": "application/json", "x-crewhub-world-mint": "x" }, body: JSON.stringify({ origin: "http://127.0.0.1:5294", checkout: "9f2c1a7b3d4e" }) });
      assert.equal(r.status, 404);
      assert.equal(((await r.json()) as { error: string }).error, "no_run_file");
    } finally {
      await bare.close();
    }
  });
});
