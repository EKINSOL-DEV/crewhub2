/**
 * Fuzz (round 34): the host's request guards. In process: the pairing cookie's reading and verification, the link
 * token, the dev-origin decision, the constant-time secret compare. Through a host on port 0: the Host and Origin
 * guards, the cookie, `/pair/<token>` and the mint route under odd headers. Seeded; a failing input prints its seed.
 */
import assert from "node:assert/strict";
import { request } from "node:http";
import { connect } from "node:net";
import { after, before, describe, it } from "node:test";
import { DEV_ORIGIN_MAX, devOriginVerdict, loopbackOrigin } from "../src/devOrigin.ts";
import { MINT_HEADER, MINT_PATH, createHost, sameSecret, type Host } from "../src/host.ts";
import { PAIR_COOKIE, createPairing, readCookie, readCookies } from "../src/pairing.ts";
import { Rng, assertPrototypeClean, headerText, oddString, oddValue, replay, safeEncode } from "./fuzz.ts";
import { type LoopsStub, createLoopsStub, installation } from "./loopsStub.ts";

const SEEDS = [34101, 34102];
const B64 = /^[A-Za-z0-9_-]+$/;

/** A Cookie header of odd parts, with the real value placed in it when `real` is given. */
function oddCookieHeader(rng: Rng, real: string | null): string {
  const parts = rng.times(rng.int(0, 5), () => {
    const name = rng.chance(0.5) ? PAIR_COOKIE : rng.pick(["other", "crewhub_world_pair2", " crewhub_world_pair", "CREWHUB_WORLD_PAIR", "", "=", oddString(rng, 2, 0)]);
    const value = rng.chance(0.3) ? `${oddString(rng, 2, 0)}.${oddString(rng, 2, 0)}` : rng.pick(["", ".", "a.", ".b", "abc.def", `${"A".repeat(22)}.${"B".repeat(43)}`, oddString(rng, 3)]);
    return rng.chance(0.1) ? name : `${name}=${value}`;
  });
  if (real !== null) parts.splice(rng.int(0, parts.length), 0, `${PAIR_COOKIE}=${real}`);
  return parts.join(rng.pick(["; ", ";", " ;", ";; "]));
}

describe("fuzz: the guards in process", () => {
  it("the pairing cookie: odd headers never throw, only an issued value pairs, a token is redeemed once", () => {
    for (const seed of SEEDS) {
      const rng = new Rng(seed);
      let t = 0;
      const pairing = createPairing({ now: () => t, ttlMs: 1000 });
      const token = pairing.mintToken();
      const real = pairing.redeem(token) as string;
      assert.ok(real && pairing.isPaired(`${PAIR_COOKIE}=${real}`));
      for (let i = 0; i < 1500; i += 1) {
        const withReal = rng.chance(0.3);
        const header = !withReal && rng.chance(0.05) ? oddString(rng, 8) : oddCookieHeader(rng, withReal ? real : null);
        let paired: boolean;
        try {
          const values = readCookies(header, PAIR_COOKIE);
          assert.ok(values.every((v) => typeof v === "string" && !v.includes(";")), replay(seed, i, header));
          assert.equal(readCookie(header, PAIR_COOKIE), values[0] ?? null, replay(seed, i, header));
          paired = pairing.isPaired(header);
        } catch (error) {
          assert.fail(`${replay(seed, i, header)}: threw ${String(error)}`);
        }
        if (withReal) assert.equal(paired, true, `${replay(seed, i, header)}: the issued cookie did not pair`);
        else assert.equal(paired, false, `${replay(seed, i, header)}: paired on a header without the issued value`);
        // A token: odd text never redeems; the real one is gone.
        const odd = rng.chance(0.5) ? oddString(rng, 4) : rng.pick([token, `${token}A`, token.slice(1), token.toLowerCase(), "A".repeat(43), "\u0000".repeat(43)]);
        assert.equal(pairing.redeem(odd), null, replay(seed, i, odd));
      }
      // Issued tokens are redeemed exactly once each, and not past their time.
      const fresh = rng.times(20, () => pairing.mintToken());
      assert.ok(fresh.every((f) => f.length === 43 && B64.test(f)));
      assert.ok(fresh.every((f) => pairing.redeem(f) !== null && pairing.redeem(f) === null));
      const late = pairing.mintToken();
      t += 1000;
      assert.equal(pairing.redeem(late), null);
      assertPrototypeClean(seed);
    }
  });

  it("the dev-origin decision: never throws, accepts only a normalised loopback http origin with a port from this checkout, never past the cap", () => {
    for (const seed of SEEDS) {
      const rng = new Rng(seed);
      let accepted = 0;
      for (let i = 0; i < 1500; i += 1) {
        const port = rng.pick([0, 1, 80, 5294, 65535, 65536, 99999, -1, 1.5, Number.NaN]);
        const origin = rng.chance(0.4)
          ? `http://${rng.pick(["127.0.0.1", "localhost", "LocalHost"])}:${rng.pick([1, 80, 5294, 65535])}`
          : rng.chance(0.6)
          ? `${rng.pick(["http://", "HTTP://", "https://", "http:/", "", "http://user@", "http://x."])}${rng.pick(["127.0.0.1", "localhost", "LocalHost", "127.0.0.2", "0.0.0.0", "[::1]", "127.0.0.1.example.com", "localhost.evil", "１２７.0.0.1"])}${rng.pick([`:${port}`, "", `:${port}/`, `:${port}/path`, `:0${port}`, `:${port}?x`, `:${port}#f`])}${rng.pick(["", " ", "\t", "\u0000", "‮"])}`
          : oddValue(rng);
        const known = new Set(rng.times(rng.int(0, DEV_ORIGIN_MAX), (k) => `http://127.0.0.1:${6000 + k}`));
        const body = rng.chance(0.8) ? { origin, checkout: rng.pick(["9f2c1a7b3d4e", "9f2c1a7b3d4e", "9f2c1a7b3d4e", "000000000000", "", undefined, 5, null]) } : oddValue(rng);
        const input = { body, originHeader: rng.chance(0.85) ? undefined : headerText(rng, 2), contentType: rng.pick(["application/json", "application/json; charset=utf-8", "APPLICATION/JSON", "text/plain", undefined, "application/jsonx", oddString(rng, 2)]), remoteAddress: rng.pick(["127.0.0.1", "::1", "::ffff:127.0.0.1", "192.168.1.20", undefined, "127.0.0.2", ""]), hostCheckout: rng.chance(0.8) ? "9f2c1a7b3d4e" : undefined, known, sameUser: rng.chance(0.85), hasSecret: rng.chance(0.9) };
        let verdict: ReturnType<typeof devOriginVerdict>;
        try {
          verdict = devOriginVerdict(input);
          loopbackOrigin(origin);
        } catch (error) {
          assert.fail(`${replay(seed, i, input)}: threw ${String(error)}`);
        }
        if (!verdict.ok) {
          assert.ok([400, 403, 404, 415, 429].includes(verdict.status) && /^[a-z_]+$/.test(verdict.error), replay(seed, i, [input, verdict]));
          continue;
        }
        accepted += 1;
        assert.match(verdict.origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/, replay(seed, i, input));
        const p = Number(verdict.origin.split(":")[2]);
        assert.ok(Number.isInteger(p) && p >= 1 && p <= 65535, replay(seed, i, input));
        assert.ok(input.originHeader === undefined && input.sameUser && input.hasSecret && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(input.remoteAddress ?? ""), replay(seed, i, input));
        assert.ok(/^application\/json\b/i.test(input.contentType ?? ""), replay(seed, i, input));
        if (input.hostCheckout !== undefined) assert.equal((body as { checkout?: unknown }).checkout, input.hostCheckout, replay(seed, i, input));
        assert.ok(known.has(verdict.origin) || known.size < DEV_ORIGIN_MAX, replay(seed, i, input));
      }
      assert.ok(accepted > 20, `${accepted} accepted: the generator reaches the acceptance`);
      assertPrototypeClean(seed);
    }
  });

  it("sameSecret: never throws on odd text of any length, equal only to itself", () => {
    const rng = new Rng(34103);
    for (let i = 0; i < 2000; i += 1) {
      const a = oddString(rng, 4);
      const b = rng.chance(0.3) ? a : rng.chance(0.3) ? `${a.slice(0, -1)}${a.endsWith("x") ? "y" : "x"}` : oddString(rng, 4);
      assert.equal(sameSecret(a, b), a === b, replay(34103, i, [a, b]));
    }
  });
});

describe("fuzz: the guards through a host", () => {
  let stub: LoopsStub;
  let host: Host;
  let cookie = "";
  const lines: string[] = [];
  before(async () => {
    stub = await createLoopsStub(installation());
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", allowedOrigins: ["http://localhost:5173"], mintSecret: "mint-secret-for-the-fuzz", retryMs: { min: 20, max: 100 }, log: (line) => lines.push(line) });
    const response = await fetch(host.mintPairLink(), { redirect: "manual" });
    cookie = (/^crewhub_world_pair=([^;]+)/.exec(response.headers.get("set-cookie") ?? "") as RegExpExecArray)[1] as string;
  });
  after(async () => {
    await host.close();
    await stub.close();
  });
  const raw = (path: string, headers: Record<string, string>) =>
    new Promise<{ status: number; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: host.port, path, method: "GET", agent: false, headers: { host: `127.0.0.1:${host.port}`, ...headers } }, (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
      });
      req.on("error", reject);
      req.end();
    });

  it("Host and Origin: 200 for the allowed values exactly, 421 and 403 for every other, never 500", async () => {
    const seed = 34110;
    const rng = new Rng(seed);
    const hosts = [`127.0.0.1:${host.port}`, `localhost:${host.port}`];
    const origins = [`http://127.0.0.1:${host.port}`, `http://localhost:${host.port}`, "http://localhost:5173"];
    let allowedSeen = 0;
    for (let i = 0; i < 400; i += 1) {
      // (An empty Host header is not sent as such: Node's client fills it with the address, so the raw-socket test covers that.)
      const hostHeader = rng.chance(0.5) ? rng.pick(hosts) : rng.chance(0.5) ? rng.pick([`127.0.0.1:${host.port + 1}`, "127.0.0.1", `LOCALHOST:${host.port}`, ` 127.0.0.1:${host.port}`, `127.0.0.1:${host.port} `, `127.0.0.1:0${host.port}`, `localhost:${host.port}.`, `evil.example:${host.port}`, `127.0.0.1:${host.port}@evil`, `[::1]:${host.port}`]) : headerText(rng) || "x";
      const origin = rng.chance(0.4) ? undefined : rng.chance(0.4) ? rng.pick(origins) : rng.chance(0.5) ? rng.pick(["null", `http://127.0.0.1:${host.port}/`, `HTTP://127.0.0.1:${host.port}`, `https://127.0.0.1:${host.port}`, `http://127.0.0.1:${host.port + 1}`, "http://localhost:5174", `http://localhost:${host.port}`.toUpperCase(), "", "*", `http://127.0.0.1:${host.port}, http://evil`]) : headerText(rng);
      let answer: Awaited<ReturnType<typeof raw>>;
      try {
        answer = await raw("/world-api/health", { host: hostHeader, ...(origin === undefined ? {} : { origin }) });
      } catch (error) {
        assert.match(String(error), /ERR_INVALID_CHAR|ERR_HTTP_INVALID_HEADER_VALUE|ERR_INVALID_HTTP_TOKEN/, replay(seed, i, [hostHeader, origin]));
        continue;
      }
      // HTTP strips the whitespace around a header value before the host sees it.
      const expected = !hosts.includes(hostHeader.trim()) ? 421 : origin !== undefined && !origins.includes(origin.trim()) ? 403 : 200;
      if (expected === 200) allowedSeen += 1;
      assert.equal(answer.status, expected, replay(seed, i, [hostHeader, origin]));
      assert.deepEqual(Object.keys(answer.headers).filter((h) => h.startsWith("access-control-")), [], replay(seed, i, [hostHeader, origin]));
    }
    assert.ok(allowedSeen > 30, `${allowedSeen} allowed`);
    assert.equal(lines.filter((l) => /request failed/.test(l)).length, 0, lines.join("\n"));
    assertPrototypeClean(seed);
  });

  it("the cookie, the link and the mint under odd headers: 401 without the issued value, 403 for every odd token, 404 for every odd mint header", async () => {
    const seed = 34111;
    const rng = new Rng(seed);
    let pairedSeen = 0;
    for (let i = 0; i < 300; i += 1) {
      const withReal = rng.chance(0.3);
      // Header-legal characters, and under Node's 16 KB header cap (a longer one is Node's own 431, not the gate's answer).
      const header = oddCookieHeader(rng, withReal ? cookie : null).replace(/[^\t\x20-\x7e\x80-\xff]/g, "").slice(0, 6000);
      const answer = await raw("/world-api/team", { cookie: header });
      if (withReal && header.includes(`${PAIR_COOKIE}=${cookie}`)) {
        pairedSeen += 1;
        assert.equal(answer.status, 200, replay(seed, i, header));
      } else assert.equal(answer.status, 401, replay(seed, i, header));
      if (i % 3 === 0) {
        const token = safeEncode(rng.chance(0.5) ? oddString(rng, 4) : rng.pick(["A".repeat(43), "A".repeat(42), "A".repeat(44), cookie, "", "..", "%2F"]));
        const link = await raw(`/pair/${token}`, {});
        assert.ok([403, 404].includes(link.status), `${replay(seed, i, token)}: ${link.status}`);
        assert.equal(link.headers["set-cookie"], undefined, replay(seed, i, token));
        const mint = await raw(MINT_PATH, { [MINT_HEADER]: headerText(rng, 3) || "x" });
        assert.equal(mint.status, 404, replay(seed, i, "mint"));
      }
    }
    assert.ok(pairedSeen > 50);
    assert.equal(lines.filter((l) => /request failed/.test(l)).length, 0, lines.join("\n"));
    assertPrototypeClean(seed);
  });

  it("malformed request lines on a raw socket are answered 4xx (Node's parser or the guard) and the host stays up", async () => {
    const seed = 34112;
    const rng = new Rng(seed);
    const send = (bytes: string) =>
      new Promise<string>((resolve) => {
        const socket = connect({ host: "127.0.0.1", port: host.port }, () => socket.write(bytes));
        let text = "";
        const done = () => resolve(text.split("\r\n")[0] ?? "");
        socket.on("data", (chunk: Buffer) => {
          text += chunk.toString("latin1");
          // The status line is all the test reads: the socket is dropped at once (a kept-alive 200 would otherwise wait for the timer).
          if (text.includes(String.fromCharCode(13, 10))) socket.destroy();
        });
        socket.on("end", done);
        socket.on("error", done);
        socket.on("close", done);
        setTimeout(() => socket.destroy(), 150);
      });
    for (let i = 0; i < 24; i += 1) {
      const line = rng.pick([
        `GET ${oddString(rng, 4)} HTTP/1.0\r\n\r\n`,
        `GET /world-api/health HTTP/1.0\r\nHost: ${headerText(rng, 3)}\r\n\r\n`,
        `GET /world-api/health HTTP/1.1\r\n\r\n`,
        `${oddString(rng, 2)} /world-api/health HTTP/1.1\r\nHost: 127.0.0.1:${host.port}\r\n\r\n`,
        `GET /world-api/health HTTP/9.9\r\nHost: 127.0.0.1:${host.port}\r\n\r\n`,
        `GET /world-api/health HTTP/1.1\r\nHost: 127.0.0.1:${host.port}\r\nCookie: ${oddString(rng, 6)}\r\n\r\n`,
        `GET /world-api/health HTTP/1.1\r\nHost: 127.0.0.1:${host.port}\r\nOrigin: ${oddString(rng, 6)}\r\n\r\n`,
        `\u0000\u0000\u0000\r\n\r\n`,
      ]);
      const status = await send(line);
      assert.ok(status === "" || /^HTTP\/1\.[01] (200|4\d\d) /.test(status), `${replay(seed, i, line)}: ${status}`);
    }
    assert.equal((await raw("/world-api/health", {})).status, 200, "the host answers after the malformed lines");
    assert.equal(lines.filter((l) => /request failed/.test(l)).length, 0, lines.join("\n"));
  });
});
