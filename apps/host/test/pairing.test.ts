/**
 * Pairing, per tab (round 27): without the bearer every /world-api route but health answers 401; a one-time link's
 * token (in the URL fragment) is exchanged once at POST /world-api/pair for a bearer; an expired link is refused (the
 * clock is injected); a bearer unused past the idle window is refused; a restart invalidates the bearer unless the
 * secret is kept in a file; the token, the bearer and the secret are in no log line; `off` is refused in production;
 * a running host mints a link for `open` through the run file's secret and nothing else.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { ConfigError, loadServerConfig } from "../src/config.ts";
import { MINT_HEADER, MINT_PATH, createHost, type Host } from "../src/host.ts";
import { DEFAULT_PAIRING_IDLE_MS, PAIR_FRAGMENT, PAIR_HEADER, PAIR_TTL_MS, createPairing, loadPairingSecret, pairLink, readPairHeader } from "../src/pairing.ts";
import { type LoopsStub, createLoopsStub, installation } from "./loopsStub.ts";
import { waitFor } from "./wait.ts";

const ROUTES = ["/world-api/snapshot", "/world-api/stream?cursor=0", "/world-api/project-groups", "/world-api/board/crewhub", "/world-api/tickets/CL-85", "/world-api/team"];

/** One GET; a stream (an open SSE response) is cut after its first bytes so the test never waits on it. */
async function status(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string; setCookie: string }> {
  const controller = new AbortController();
  const response = await fetch(url, { headers, redirect: "manual", signal: controller.signal });
  const setCookie = response.headers.get("set-cookie") ?? "";
  if ((response.headers.get("content-type") ?? "").startsWith("text/event-stream")) {
    const chunk = await response.body!.getReader().read();
    controller.abort();
    return { status: response.status, body: new TextDecoder().decode(chunk.value ?? new Uint8Array()), setCookie };
  }
  return { status: response.status, body: await response.text(), setCookie };
}

/** The token a page reads out of the link's fragment. */
const token = (link: string) => new URL(link).hash.replace(`#${PAIR_FRAGMENT}=`, "");

/** Pairs as the page does: the token from the fragment, exchanged at POST /world-api/pair for the bearer; the header to send back. */
async function pair(link: string, origin = new URL(link).origin): Promise<{ paired: Record<string, string>; value: string; idleDays: number }> {
  const response = await fetch(`${origin}/world-api/pair`, { method: "POST", headers: { origin, [PAIR_HEADER]: token(link) } });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const body = JSON.parse(text) as { bearer: string; idleDays: number };
  assert.ok(body.bearer, "no bearer in the answer");
  return { paired: { [PAIR_HEADER]: body.bearer }, value: body.bearer, idleDays: body.idleDays };
}

describe("pairing", () => {
  let stub: LoopsStub;
  let host: Host;
  let clock = 1_000_000;
  const logs: string[] = [];
  before(async () => {
    stub = await createLoopsStub(installation());
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", retryMs: { min: 20, max: 100 }, now: () => clock, mintSecret: "mint-secret-for-the-test", log: (line) => logs.push(line) });
    // The tests below read `loops: "ok"` from health: wait for the stream, never for health's bounded wait.
    await waitFor("the stream", async () => ((await (await fetch(`${host.url}/world-api/health`)).json()) as { loops: string }).loops === "ok");
  });
  after(async () => {
    await host.close();
    await stub.close();
  });

  it("answers 401 not_paired on every route class without the bearer; health stays open and says paired: false", async () => {
    for (const route of ROUTES) {
      const answer = await status(`${host.url}${route}`);
      assert.equal(answer.status, 401, route);
      assert.deepEqual(JSON.parse(answer.body), { error: "not_paired" }, route);
    }
    const health = JSON.parse((await status(`${host.url}/world-api/health`)).body) as { paired: boolean; pairing: string; pairingIdleDays: number };
    assert.equal(health.paired, false);
    assert.equal(health.pairing, "on");
    assert.equal(health.pairingIdleDays, 30, "the default idle window, for the Pair screen");
  });

  it("a link carries the token in the fragment and pairs once: the bearer, every route open with it in the header, the same token refused the second time", async () => {
    const link = host.mintPairLink();
    assert.match(link, new RegExp(`^${host.url}/#pair=[A-Za-z0-9_-]{43}$`), "the token is in the fragment: never sent to a server");
    const { paired, value, idleDays } = await pair(link);
    assert.match(value, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(idleDays, 30);
    for (const route of ROUTES) {
      const answer = await status(`${host.url}${route}`, paired);
      assert.notEqual(answer.status, 401, route);
    }
    const health = JSON.parse((await status(`${host.url}/world-api/health`, paired)).body) as { paired: boolean };
    assert.equal(health.paired, true);
    const again = await fetch(`${host.url}/world-api/pair`, { method: "POST", headers: { origin: host.url, [PAIR_HEADER]: token(link) } });
    assert.equal(again.status, 403, "a token is spent by its first use");
    assert.equal(((await again.json()) as { error: string }).error, "pair_refused");
    assert.equal((await fetch(`${host.url}/world-api/pair`, { method: "POST", headers: { [PAIR_HEADER]: token(host.mintPairLink()) } })).status, 403, "no Origin: not the world's page");
    assert.equal((await fetch(`${host.url}/world-api/pair`, { method: "GET", headers: { origin: host.url } })).status, 405);
    assert.equal((await fetch(`${host.url}/world-api/pair`, { method: "POST", headers: { origin: host.url } })).status, 403, "no token");
  });

  it("refuses an unknown token, a forged bearer, a bearer with a wrong signature, a bearer in a cookie or in Authorization (the pairing has its own header)", async () => {
    assert.equal((await fetch(`${host.url}/world-api/pair`, { method: "POST", headers: { origin: host.url, [PAIR_HEADER]: "A".repeat(43) } })).status, 403);
    assert.equal((await status(`${host.url}/world-api/snapshot`, { [PAIR_HEADER]: "abc.def" })).status, 401);
    const { value } = await pair(host.mintPairLink());
    const [id, mac] = value.split(".") as [string, string];
    const flipped = `${id}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`;
    assert.equal((await status(`${host.url}/world-api/snapshot`, { [PAIR_HEADER]: flipped })).status, 401);
    assert.equal((await status(`${host.url}/world-api/snapshot`, { [PAIR_HEADER]: `${value}\u00e9` })).status, 401, "a non-ASCII byte is unequal, never an error");
    assert.equal((await status(`${host.url}/world-api/snapshot`, { cookie: `crewhub_world_pair=${value}` })).status, 401, "a cookie is not a way in");
    assert.equal((await status(`${host.url}/world-api/snapshot`, { authorization: `Bearer ${value}` })).status, 401, "nor the Authorization header");
    assert.equal((await status(`${host.url}/world-api/snapshot`, { [PAIR_HEADER]: ` ${value} ` })).status, 200, "whitespace around the value is free");
  });

  it("refuses an expired link (the clock injected): 10 minutes, not a second more", async () => {
    const fresh = host.mintPairLink();
    const old = host.mintPairLink();
    clock += PAIR_TTL_MS - 1;
    assert.equal((await pair(fresh)).value.length > 0, true, "still valid a millisecond before");
    clock += 2;
    assert.equal((await fetch(`${host.url}/world-api/pair`, { method: "POST", headers: { origin: host.url, [PAIR_HEADER]: token(old) } })).status, 403, "expired");
  });

  it("a bearer unused for the idle window is refused; one in use is kept going (round 27's expiry)", async () => {
    const { paired } = await pair(host.mintPairLink());
    clock += DEFAULT_PAIRING_IDLE_MS - 1000;
    assert.equal((await status(`${host.url}/world-api/team`, paired)).status, 200, "used a second before the window closes: still paired");
    clock += DEFAULT_PAIRING_IDLE_MS - 1000;
    assert.equal((await status(`${host.url}/world-api/team`, paired)).status, 200, "the window slid with the use");
    clock += DEFAULT_PAIRING_IDLE_MS + 1;
    assert.equal((await status(`${host.url}/world-api/team`, paired)).status, 401, "unused past the window: out");
    assert.equal((await status(`${host.url}/world-api/team`, paired)).status, 401, "and stays out");
  });

  it("puts the token, the bearer and the secret in no response body and no log line", async () => {
    const link = host.mintPairLink();
    const { value } = await pair(link);
    const bodies: string[] = [];
    for (const route of [...ROUTES, "/world-api/health", "/world-api/nope", MINT_PATH]) {
      bodies.push((await status(`${host.url}${route}`)).body);
      bodies.push((await status(`${host.url}${route}`, { [PAIR_HEADER]: value })).body);
    }
    const all = [...bodies, ...logs].join("\n");
    assert.ok(!all.includes(token(link)), "the token");
    assert.ok(!all.includes(value), "the bearer");
    assert.ok(!/secret/i.test(logs.join("\n")), "the secret");
  });

  it("mints a link for a running host only with the run file's secret, never with an Origin", async () => {
    const good = await status(`${host.url}${MINT_PATH}`, { [MINT_HEADER]: "mint-secret-for-the-test" });
    assert.equal(good.status, 200);
    const { link } = JSON.parse(good.body) as { link: string };
    assert.match(link, new RegExp(`^${host.url}/#pair=[A-Za-z0-9_-]{43}$`));
    assert.ok((await pair(link)).value, "the running host accepts the link it minted");
    assert.equal((await status(`${host.url}${MINT_PATH}`)).status, 404);
    assert.equal((await status(`${host.url}${MINT_PATH}`, { [MINT_HEADER]: "wrong" })).status, 404);
    assert.equal((await status(`${host.url}${MINT_PATH}`, { [MINT_HEADER]: "mint-secret-for-the-test", origin: host.url })).status, 404);
    const other = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", retryMs: { min: 20, max: 100 } });
    try {
      assert.equal((await status(`${other.url}${MINT_PATH}`, { [MINT_HEADER]: "mint-secret-for-the-test" })).status, 404, "no mint secret, no mint route");
    } finally {
      await other.close();
    }
  });

  it("a mint header with a non-ASCII byte of the right character length is 404, never a 500 (review F5)", async () => {
    const expected = "mint-secret-for-the-test";
    const bad = `${expected.slice(0, -1)}\u00e9`;
    assert.equal(bad.length, expected.length);
    assert.equal((await status(`${host.url}${MINT_PATH}`, { [MINT_HEADER]: bad })).status, 404);
    assert.equal(logs.filter((l) => /request failed/.test(l)).length, 0, "no failed request in the log");
  });

  it("mints a link for another origin that proxies /world-api (the Vite dev server): the fragment on that origin", () => {
    assert.equal(pairLink("http://127.0.0.1:5173/", "T".repeat(43)), `http://127.0.0.1:5173/#pair=${"T".repeat(43)}`);
    assert.match(host.mintPairLink("http://127.0.0.1:5173/"), /^http:\/\/127\.0\.0\.1:5173\/#pair=[A-Za-z0-9_-]{43}$/);
    assert.equal(readPairHeader(" x.y "), "x.y");
    assert.equal(readPairHeader("x y"), null);
    assert.equal(readPairHeader(undefined), null);
  });

  it("the old /pair/<token> path is the app's own page now (the SPA fallback or 404 without a dist), never a pairing", async () => {
    const r = await status(`${host.url}/pair/${"A".repeat(43)}`);
    assert.ok(r.status === 404 || r.status === 200, String(r.status));
    assert.equal(r.setCookie, "", "no cookie, ever");
  });
});

describe("pairing across restarts", () => {
  it("a restart without a pairing file invalidates the bearer; with the file (0600) it keeps it", async () => {
    const stub = await createLoopsStub(installation());
    const dir = mkdtempSync(path.join(tmpdir(), "crewhub-pairing-"));
    const file = path.join(dir, "nested", "pairing.secret");
    // Every host is closed on the way out, also when an assertion throws: an open host keeps the test process alive.
    let first: Host | undefined;
    try {
      first = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", retryMs: { min: 20, max: 100 } });
      const { paired } = await pair(first.mintPairLink());
      assert.equal((await status(`${first.url}/world-api/team`, paired)).status, 200);
      await first.close();
      first = undefined;
      const second = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", retryMs: { min: 20, max: 100 } });
      try {
        assert.equal((await status(`${second.url}/world-api/team`, paired)).status, 401, "a per-run secret: the old bearer is out");
      } finally {
        await second.close();
      }

      const secret = loadPairingSecret(file);
      assert.equal(secret.length, 32);
      assert.equal(statSync(file).mode & 0o777, 0o600);
      assert.equal(readFileSync(file, "utf8").trim(), secret.toString("base64url"));
      const kept = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairingSecret: secret, retryMs: { min: 20, max: 100 } });
      const keptBearer = (await pair(kept.mintPairLink())).paired;
      await kept.close();
      const reloaded = loadPairingSecret(file);
      assert.deepEqual(reloaded, secret, "the same secret comes back from the file");
      const again = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairingSecret: reloaded, retryMs: { min: 20, max: 100 } });
      try {
        assert.equal((await status(`${again.url}/world-api/team`, keptBearer)).status, 200, "the file kept the pairing (the idle window starts again at the first use)");
        assert.equal((await status(`${again.url}/world-api/team`, paired)).status, 401, "a bearer from another secret stays out");
      } finally {
        await again.close();
      }
    } finally {
      await first?.close();
      rmSync(dir, { recursive: true, force: true });
      await stub.close();
    }
  });
});

describe("the pairing secret file", () => {
  it("a file whose text decodes to fewer than 32 bytes is replaced by a fresh secret (review N1), a whole one is kept", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-secret-"));
    try {
      const file = path.join(dir, "pairing-secret");
      writeFileSync(file, "A\n", { mode: 0o600 });
      const fresh = loadPairingSecret(file);
      assert.equal(fresh.length, 32);
      assert.notEqual(readFileSync(file, "utf8").trim(), "A", "the file was rewritten");
      assert.deepEqual(loadPairingSecret(file), fresh, "and read back whole");
      writeFileSync(file, Buffer.alloc(31, 7).toString("base64url"), { mode: 0o600 });
      assert.notDeepEqual(loadPairingSecret(file), Buffer.alloc(31, 7), "31 bytes is not a secret either");
      assert.equal(loadPairingSecret(file).length, 32);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("pairing off and the public URL", () => {
  it("off: no gate, health says paired: true and pairing: off, POST /world-api/pair answers no bearer and sets no cookie", async () => {
    const stub = await createLoopsStub(installation());
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 } });
    try {
      assert.equal((await status(`${host.url}/world-api/team`)).status, 200);
      assert.deepEqual(Object.fromEntries(Object.entries(JSON.parse((await status(`${host.url}/world-api/health`)).body) as object).filter(([k]) => k === "paired" || k === "pairing")), { paired: true, pairing: "off" });
      const link = host.mintPairLink();
      const answer = await fetch(`${host.url}/world-api/pair`, { method: "POST", headers: { origin: host.url, [PAIR_HEADER]: token(link) } });
      assert.equal(answer.status, 200);
      assert.deepEqual(await answer.json(), { ok: true, bearer: null, idleDays: 0 });
      assert.equal(answer.headers.get("set-cookie"), null, "no cookie on this road");
    } finally {
      await host.close();
      await stub.close();
    }
  });

  it("CREWHUB_WORLD_PAIRING=off is refused under NODE_ENV=production and warns loudly otherwise; the file and the public URL are read", () => {
    assert.throws(() => loadServerConfig({ CREWHUB_WORLD_PAIRING: "off", NODE_ENV: "production" }), ConfigError);
    assert.throws(() => loadServerConfig({ CREWHUB_WORLD_PAIRING: "maybe" }), ConfigError);
    assert.throws(() => loadServerConfig({ CREWHUB_WORLD_PUBLIC_URL: "localhost" }), ConfigError);
    const dev = loadServerConfig({ CREWHUB_WORLD_PAIRING: "off" });
    assert.equal(dev.pairing, "off");
    assert.ok(dev.warnings.some((line) => line.includes("WARNING") && line.includes("CREWHUB_WORLD_PAIRING=off")));
    const prod = loadServerConfig({ NODE_ENV: "production", CREWHUB_WORLD_PAIRING_FILE: "run/pairing.secret", CREWHUB_WORLD_PUBLIC_URL: "https://localhost:9443/" });
    assert.equal(prod.pairing, "on");
    assert.equal(prod.pairingFile, path.resolve("run/pairing.secret"));
    assert.equal(prod.publicUrl, "https://localhost:9443");
    assert.deepEqual(prod.warnings, []);
  });

  it("an https public URL allows that Host and Origin, and the pairing link is minted on it", async () => {
    const stub = await createLoopsStub(installation());
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", publicUrl: "https://localhost:9443", retryMs: { min: 20, max: 100 } });
    try {
      assert.match(host.mintPairLink("https://localhost:9443"), /^https:\/\/localhost:9443\/#pair=[A-Za-z0-9_-]{43}$/);
      assert.ok((await pair(host.mintPairLink(), host.url)).value, "paired at the host's own origin (the test's reach)");
      const raw = (headers: Record<string, string>) =>
        new Promise<number>((resolve, reject) => {
          const req = request({ host: "127.0.0.1", port: host.port, path: "/world-api/health", method: "GET", headers }, (res) => (res.resume(), res.on("end", () => resolve(res.statusCode ?? 0))));
          req.on("error", reject);
          req.end();
        });
      assert.equal(await raw({ host: "localhost:9443" }), 200);
      assert.equal(await raw({ host: `127.0.0.1:${host.port}`, origin: "https://localhost:9443" }), 200);
      assert.equal(await raw({ host: "localhost:9444" }), 421);
    } finally {
      await host.close();
      await stub.close();
    }
  });
});

describe("the pairing state machine", () => {
  it("keeps only hashes, prunes expired tokens and compares in constant length", () => {
    let t = 0;
    const pairing = createPairing({ now: () => t, ttlMs: 100 });
    const a = pairing.mintToken();
    pairing.mintToken();
    assert.equal(pairing.pending(), 2);
    t = 100;
    assert.equal(pairing.pending(), 0);
    assert.equal(pairing.redeem(a), null);
    const b = pairing.mintToken();
    const cookie = pairing.redeem(b);
    assert.ok(cookie);
    assert.equal(pairing.redeem(b), null, "single use");
    assert.equal(pairing.isPaired(cookie), true);
    assert.equal(pairing.isPaired(`${cookie}x`), false);
    assert.equal(pairing.isPaired(undefined), false);
    assert.equal(createPairing().isPaired(cookie), false, "another secret");
  });
});
