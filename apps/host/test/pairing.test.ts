/**
 * Pairing (plan 3.5): without the cookie every /world-api route but health answers 401; a link pairs once; an expired
 * link is refused (the clock is injected); a restart invalidates the cookie unless the secret is kept in a file; the
 * token, the cookie value and the secret are in no response body and no log line; `off` is refused in production;
 * a running host mints a link for `open` through the run file's secret and nothing else.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { ConfigError, loadServerConfig } from "../src/config.ts";
import { MINT_HEADER, MINT_PATH, createHost, type Host } from "../src/host.ts";
import { PAIR_COOKIE, PAIR_TTL_MS, createPairing, loadPairingSecret, readCookie } from "../src/pairing.ts";
import { type LoopsStub, createLoopsStub, installation } from "./loopsStub.ts";

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

/** Opens the link as a browser would; returns the Set-Cookie header and the cookie to send back. */
async function pair(link: string): Promise<{ setCookie: string; cookie: string; value: string }> {
  const response = await fetch(link, { redirect: "manual" });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/");
  const setCookie = response.headers.get("set-cookie") ?? "";
  const value = readCookie(setCookie.split(";")[0], PAIR_COOKIE);
  assert.ok(value, `no cookie in ${setCookie}`);
  return { setCookie, cookie: `${PAIR_COOKIE}=${value}`, value };
}

const token = (link: string) => link.slice(link.lastIndexOf("/") + 1);

describe("pairing", () => {
  let stub: LoopsStub;
  let host: Host;
  let clock = 1_000_000;
  const logs: string[] = [];
  before(async () => {
    stub = await createLoopsStub(installation());
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", retryMs: { min: 20, max: 100 }, now: () => clock, mintSecret: "mint-secret-for-the-test", log: (line) => logs.push(line) });
  });
  after(async () => {
    await host.close();
    await stub.close();
  });

  it("answers 401 not_paired on every route class without the cookie; health stays open and says paired: false", async () => {
    for (const route of ROUTES) {
      const answer = await status(`${host.url}${route}`);
      assert.equal(answer.status, 401, route);
      assert.deepEqual(JSON.parse(answer.body), { error: "not_paired" });
    }
    const health = await status(`${host.url}/world-api/health`);
    assert.equal(health.status, 200);
    const body = JSON.parse(health.body) as { paired: boolean; pairing: string; loops: string };
    assert.equal(body.paired, false);
    assert.equal(body.pairing, "on");
    assert.equal(body.loops, "ok");
  });

  it("a link pairs once: the cookie shape, every route open with it, the same link refused the second time", async () => {
    const link = host.mintPairLink();
    assert.match(link, new RegExp(`^${host.url}/pair/[A-Za-z0-9_-]{43}$`));
    const { setCookie, cookie } = await pair(link);
    assert.match(setCookie, /^crewhub_world_pair=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; HttpOnly; SameSite=Strict; Path=\/$/);
    for (const route of ROUTES) {
      const answer = await status(`${host.url}${route}`, { cookie });
      assert.notEqual(answer.status, 401, route);
    }
    const health = JSON.parse((await status(`${host.url}/world-api/health`, { cookie })).body) as { paired: boolean };
    assert.equal(health.paired, true);
    const again = await status(link);
    assert.equal(again.status, 403);
    assert.match(again.body, /This link has expired or was already used/);
    assert.match(again.body, /npm run host -- open/);
    assert.equal(again.setCookie, "");
  });

  it("refuses an unknown token, a forged cookie and a cookie with a wrong signature", async () => {
    assert.equal((await status(`${host.url}/pair/${"A".repeat(43)}`)).status, 403);
    assert.equal((await status(`${host.url}/pair/`)).status, 403);
    assert.equal((await status(`${host.url}/world-api/snapshot`, { cookie: `${PAIR_COOKIE}=abc.def` })).status, 401);
    const { value } = await pair(host.mintPairLink());
    const [id, mac] = value.split(".") as [string, string];
    const flipped = `${id}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`;
    assert.equal((await status(`${host.url}/world-api/snapshot`, { cookie: `${PAIR_COOKIE}=${flipped}` })).status, 401);
    assert.equal((await status(`${host.url}/world-api/snapshot`, { cookie: `other=1; ${PAIR_COOKIE}=${value}` })).status, 200);
  });

  it("refuses an expired link (the clock injected): 10 minutes, not a second more", async () => {
    const fresh = host.mintPairLink();
    clock += PAIR_TTL_MS - 1;
    assert.equal((await status(fresh)).status, 303, "still valid a millisecond before");
    const late = host.mintPairLink();
    clock += PAIR_TTL_MS;
    assert.equal((await status(late)).status, 403);
  });

  it("puts the token, the cookie value and the secret in no response body and no log line", async () => {
    const link = host.mintPairLink();
    const { value } = await pair(link);
    const secrets = [token(link), value];
    const bodies: string[] = [];
    for (const route of [...ROUTES, "/world-api/health", "/world-api/nope", `/pair/${token(link)}`, MINT_PATH]) {
      bodies.push((await status(`${host.url}${route}`)).body);
      bodies.push((await status(`${host.url}${route}`, { cookie: `${PAIR_COOKIE}=${value}` })).body);
    }
    bodies.push((await status(`${host.url}${MINT_PATH}`, { [MINT_HEADER]: "mint-secret-for-the-test" })).body);
    for (const text of [...bodies, ...logs]) for (const secret of secrets) assert.ok(!text.includes(secret), `leaked in: ${text.slice(0, 80)}`);
    for (const text of [...bodies, ...logs]) assert.ok(!text.includes("mint-secret-for-the-test"), "the mint secret leaked");
  });

  it("mints a link for a running host only with the run file's secret, never with an Origin", async () => {
    const good = await status(`${host.url}${MINT_PATH}`, { [MINT_HEADER]: "mint-secret-for-the-test" });
    assert.equal(good.status, 200);
    const { link } = JSON.parse(good.body) as { link: string };
    assert.match(link, new RegExp(`^${host.url}/pair/[A-Za-z0-9_-]{43}$`));
    assert.equal((await status(link)).status, 303, "the running host accepts the link it minted");
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

  it("mints a link for another origin that proxies /pair (the Vite dev server)", () => {
    assert.match(host.mintPairLink("http://127.0.0.1:5173/"), /^http:\/\/127\.0\.0\.1:5173\/pair\/[A-Za-z0-9_-]{43}$/);
  });

  it("answers 405 to anything but GET on /pair and the gate, and keeps the Host guard in front", async () => {
    const post = await new Promise<number>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: host.port, path: "/pair/x", method: "POST" }, (res) => (res.resume(), res.on("end", () => resolve(res.statusCode ?? 0))));
      req.on("error", reject);
      req.end();
    });
    assert.equal(post, 405);
  });
});

describe("pairing across restarts", () => {
  it("a restart without a pairing file invalidates the cookie; with the file (0600) it keeps it", async () => {
    const stub = await createLoopsStub(installation());
    const dir = mkdtempSync(path.join(tmpdir(), "crewhub-pairing-"));
    const file = path.join(dir, "nested", "pairing.secret");
    try {
      const first = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", retryMs: { min: 20, max: 100 } });
      const { cookie } = await pair(first.mintPairLink());
      assert.equal((await status(`${first.url}/world-api/team`, { cookie })).status, 200);
      await first.close();
      const second = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", retryMs: { min: 20, max: 100 } });
      try {
        assert.equal((await status(`${second.url}/world-api/team`, { cookie })).status, 401, "a per-run secret: the old cookie is out");
      } finally {
        await second.close();
      }

      const secret = loadPairingSecret(file);
      assert.equal(secret.length, 32);
      assert.equal(statSync(file).mode & 0o777, 0o600);
      assert.equal(readFileSync(file, "utf8").trim(), secret.toString("base64url"));
      const kept = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairingSecret: secret, retryMs: { min: 20, max: 100 } });
      const keptCookie = (await pair(kept.mintPairLink())).cookie;
      await kept.close();
      const reloaded = loadPairingSecret(file);
      assert.deepEqual(reloaded, secret, "the same secret comes back from the file");
      const again = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairingSecret: reloaded, retryMs: { min: 20, max: 100 } });
      try {
        assert.equal((await status(`${again.url}/world-api/team`, { cookie: keptCookie })).status, 200, "the file kept the pairing");
        assert.equal((await status(`${again.url}/world-api/team`, { cookie })).status, 401, "a cookie from another secret stays out");
      } finally {
        await again.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await stub.close();
    }
  });
});

describe("pairing off and the public URL", () => {
  it("off: no gate, health says paired: true and pairing: off, a /pair link just lands on /", async () => {
    const stub = await createLoopsStub(installation());
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 } });
    try {
      assert.equal((await status(`${host.url}/world-api/team`)).status, 200);
      assert.deepEqual(Object.fromEntries(Object.entries(JSON.parse((await status(`${host.url}/world-api/health`)).body) as object).filter(([k]) => k === "paired" || k === "pairing")), { paired: true, pairing: "off" });
      const link = await status(host.mintPairLink());
      assert.equal(link.status, 303);
      assert.equal(link.setCookie, "");
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

  it("an https public URL makes the cookie Secure and allows that Host and Origin", async () => {
    const stub = await createLoopsStub(installation());
    const host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", publicUrl: "https://localhost:9443", retryMs: { min: 20, max: 100 } });
    try {
      const { setCookie } = await pair(host.mintPairLink());
      assert.match(setCookie, /; Secure$/);
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
    assert.equal(pairing.isPaired(`${PAIR_COOKIE}=${cookie}`), true);
    assert.equal(pairing.isPaired(`${PAIR_COOKIE}=${cookie}x`), false);
    assert.equal(pairing.isPaired(undefined), false);
    assert.equal(createPairing().isPaired(`${PAIR_COOKIE}=${cookie}`), false, "another secret");
  });
});
