/**
 * Fuzz (round 34): the allow-list's path and query matching, in process and through a host. Seeded (the seeds are
 * below); a failing input prints with its seed. What a caller sees: a match only for a route on the list, with
 * segments that are segments and a query of the route's keys only; `allowedLoopsPath` returns the normalised path
 * with the read's keys only or throws its one documented error; through the host every odd request is answered with
 * a documented status (never 500) and crewhub-loops sees only GETs of allow-listed paths.
 */
import assert from "node:assert/strict";
import { request } from "node:http";
import { after, before, describe, it } from "node:test";
import { LOOPS_READS, WORLD_API_PREFIX, WORLD_ROUTES, allowedLoopsPath, fillPattern, isSegment, matchWorldRoute } from "../src/allowList.ts";
import { createHost, type Host } from "../src/host.ts";
import { PROTO_KEYS, Rng, assertPrototypeClean, oddString, replay, safeEncode } from "./fuzz.ts";
import { type LoopsStub, createLoopsStub, installation } from "./loopsStub.ts";

const SEEDS = [34001, 34002, 34003];
const PATTERNS = [...WORLD_ROUTES.map((r) => r.pattern), ...LOOPS_READS.map((r) => r.pattern)];
const QUERY_KEYS = ["limit", "cursor", "after", "from", "ticket", "types", "includeArchived", "q", "project", "__proto__", "constructor", "", "LIMIT", "limit ", "cursor[]"];
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** A pathname: a route pattern with its `{x}` filled with odd text, or mangled, or odd throughout. */
function oddPath(rng: Rng): string {
  const kind = rng.int(0, 9);
  if (kind <= 5) {
    const pattern = rng.pick(PATTERNS);
    let path = pattern.replace(/\{\w+\}/g, () => (rng.chance(0.6) ? rng.pick(["CL-85", "tk_1", "atlas", "CL-111.2", "a".repeat(128), "a".repeat(129)]) : safeEncode(oddString(rng, 3))));
    if (kind === 1) path = path.replace("/api", rng.pick([WORLD_API_PREFIX, "/world-apix", "/World-API", "//world-api", "/world-api/.", "/world-api/..", "/api/../world-api"]));
    else if (kind === 2) path = `${WORLD_API_PREFIX}${path.replace(/^\/api/, "")}`;
    else if (kind === 3) path = `${WORLD_API_PREFIX}${path.replace(/^\/api/, "")}${rng.pick(["/", "//", "/x", "/..", "%2F", "%", "?", "#a", "\u0000"])}`;
    else if (kind === 4) path = path.replace(/\/([^/]+)$/, (_m, seg: string) => `/${rng.pick([seg.toUpperCase(), `${seg}/`, `${seg}%2F..`, safeEncode(seg), `%${seg}`, `${seg}‮`])}`);
    else if (kind === 5) path = `${WORLD_API_PREFIX}${path.replace(/^\/api/, "")}`;
    return path;
  }
  if (kind === 6) return `${WORLD_API_PREFIX}/${oddString(rng, 4)}`;
  if (kind === 7) return `${WORLD_API_PREFIX}${rng.pick(["", "/", "//", "/health/", "/health/x", "/stream?cursor=1", "/town/backups/", "/town/backups/../export", "/tickets/CL-85/comments/", "/tickets//comments"])}`;
  return oddString(rng, 5);
}
function oddSearch(rng: Rng): URLSearchParams {
  const search = new URLSearchParams();
  for (let i = rng.int(0, 4); i > 0; i -= 1) search.append(rng.chance(0.7) ? rng.pick(QUERY_KEYS) : oddString(rng, 2), rng.chance(0.5) ? rng.pick(["5", "0", "-1", "1e999", "abc", "500", "501", "", "NaN"]) : oddString(rng, 3));
  return search;
}

describe("fuzz: the allow-list in process", () => {
  it("matchWorldRoute: never throws; a match names a listed route, with segments that are segments and the route's query keys only", () => {
    let matches = 0;
    for (const seed of SEEDS) {
      const rng = new Rng(seed);
      for (let i = 0; i < 1500; i += 1) {
        const pathname = oddPath(rng);
        const search = oddSearch(rng);
        let match: ReturnType<typeof matchWorldRoute>;
        try {
          match = matchWorldRoute(pathname, search);
        } catch (error) {
          assert.fail(`${replay(seed, i, pathname)}: threw ${String(error)}`);
        }
        if (match === null) continue;
        matches += 1;
        assert.ok(WORLD_ROUTES.includes(match.route), replay(seed, i, pathname));
        for (const [name, value] of Object.entries(match.params)) assert.ok(SEGMENT_RE.test(value) && isSegment(value), `${replay(seed, i, pathname)}: param ${name} = ${JSON.stringify(value)} is no segment`);
        for (const key of match.query.keys()) {
          assert.ok(match.route.query.includes(key), `${replay(seed, i, pathname)}: query key ${key} passed`);
          assert.equal(match.query.get(key), search.get(key), replay(seed, i, pathname));
        }
        // The match round-trips: the pattern filled with the captured segments matches the same route again.
        const again = matchWorldRoute(`${WORLD_API_PREFIX}${fillPattern(match.route.pattern, match.params)}`, new URLSearchParams());
        assert.equal(again?.route, match.route, replay(seed, i, pathname));
        // Nothing with a `/`, a `..` or a control character hides in a segment once decoded.
        for (const value of Object.values(match.params)) assert.ok(!/[/\\\u0000-\u001f]/.test(value) && value !== ".." && value !== ".", replay(seed, i, pathname));
      }
      assertPrototypeClean(seed);
    }
    assert.ok(matches > 300, `${matches} matches: the generator reaches the routes`);
  });

  it("allowedLoopsPath: the normalised path with the read's query keys only, or the one documented error", () => {
    let allowed = 0;
    for (const seed of SEEDS) {
      const rng = new Rng(seed);
      for (let i = 0; i < 1500; i += 1) {
        const path = rng.chance(0.6) ? rng.pick(LOOPS_READS).pattern.replace(/\{\w+\}/g, () => rng.pick(["CL-85", "tk_1", "atlas", "old", "x".repeat(128)])) : oddPath(rng);
        const query: Record<string, string> = {};
        for (let k = rng.int(0, 4); k > 0; k -= 1) {
          const key = rng.chance(0.7) ? rng.pick(QUERY_KEYS) : oddString(rng, 2);
          Object.defineProperty(query, key, { value: rng.chance(0.5) ? rng.pick(["5", "0", "-1", "1e999", "500", "501", "", "a,b", "tk_1"]) : oddString(rng, 3), enumerable: true, configurable: true, writable: true });
        }
        let out: string;
        try {
          out = allowedLoopsPath(path, query);
        } catch (error) {
          assert.ok(error instanceof Error && /^loops path not on the allow-list: /.test(error.message), `${replay(seed, i, [path, query])}: threw ${String(error)}`);
          continue;
        }
        allowed += 1;
        const [sentPath, qs = ""] = out.split("?") as [string, string?];
        // The path sent is the normalised one: the input's segments, decoded, with no empty segment and no trailing slash.
        assert.deepEqual(sentPath.split("/").slice(1), path.split("/").filter((p) => p !== "").map(decodeURIComponent), replay(seed, i, [path, query]));
        assert.ok(!sentPath.includes("//") && !sentPath.endsWith("/"), replay(seed, i, [path, query]));
        assert.equal(allowedLoopsPath(sentPath).split("?")[0], sentPath, `${replay(seed, i, path)}: not idempotent`);
        const read = LOOPS_READS.find((r) => new RegExp(`^${r.pattern.replace(/\{\w+\}/g, "[^/]+")}$`).test(sentPath));
        assert.ok(read, `${replay(seed, i, path)}: allowed yet on no read`);
        const sent = new URLSearchParams(qs);
        for (const key of sent.keys()) {
          assert.ok(read.query.includes(key), `${replay(seed, i, [path, query])}: query key ${key} sent`);
          // The value as URLSearchParams carries it (a lone surrogate becomes U+FFFD there, as in any URL).
          assert.equal(sent.get(key), new URLSearchParams([[key, query[key] as string]]).get(key), replay(seed, i, [path, query]));
        }
        for (const key of PROTO_KEYS) assert.ok(!sent.has(key), replay(seed, i, [path, query]));
        assert.ok(!/[\s\u0000-\u001f"<>\\^`{|}]/.test(out), `${replay(seed, i, [path, query])}: unencoded character in ${out}`);
      }
      assertPrototypeClean(seed);
    }
    assert.ok(allowed > 1000, `${allowed} allowed paths`);
  });
});

describe("fuzz: the allow-list through a host", () => {
  let stub: LoopsStub;
  let host: Host;
  const lines: string[] = [];
  before(async () => {
    stub = await createLoopsStub(installation());
    host = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", pairing: "off", retryMs: { min: 20, max: 100 }, log: (line) => lines.push(line) });
  });
  after(async () => {
    await host.close();
    await stub.close();
  });
  const raw = (method: string, path: string) =>
    new Promise<{ status: number }>((resolve, reject) => {
      // A fresh connection per request: a 405 to a request whose chunked body is still arriving closes the connection
      // after the answer, and a pooled socket would meet that close on the next request (browsers retry that; a test must not).
      const req = request({ host: "127.0.0.1", port: host.port, path, method, agent: false, headers: { host: `127.0.0.1:${host.port}` } }, (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
      });
      req.on("error", reject);
      req.end(method === "GET" || method === "HEAD" ? undefined : "{}");
    });

  it("every odd method and path is answered with a documented status, never 500, and loops saw only GETs of listed paths", async () => {
    const seed = 34010;
    const rng = new Rng(seed);
    const statuses = new Map<number, number>();
    for (let i = 0; i < 400; i += 1) {
      // The stream route would hold the connection open: it is left to its own tests.
      let path = `${oddPath(rng)}${rng.chance(0.4) ? `?${oddSearch(rng)}` : ""}`.replace(/\/stream\b/g, "/snapshot");
      path = path.replace(/[\ud800-\udfff]/g, "");
      if (/[\u0000-\u001f\u007f-￿]/.test(path)) path = encodeURI(path).replace(/%00/g, "");
      const method = rng.pick(["GET", "GET", "GET", "GET", "GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD", "TRACE", "BREW"]);
      let status: number;
      try {
        status = (await raw(method, path)).status;
      } catch (error) {
        // Node's own client refuses a request line it cannot write: not the host's answer.
        assert.match(String(error), /ERR_UNESCAPED_CHARACTERS|ERR_INVALID_CHAR|ERR_INVALID_ARG_VALUE|ERR_HTTP_INVALID_HEADER_VALUE/, replay(seed, i, [method, path]));
        continue;
      }
      statuses.set(status, (statuses.get(status) ?? 0) + 1);
      // 400 and 431 are Node's parser's own (a method it does not know, a request line past 16 KB), before the host sees the request.
      assert.ok([200, 400, 401, 403, 404, 405, 409, 415, 431, 503].includes(status), `${replay(seed, i, [method, path])}: status ${status}`);
    }
    assert.equal(lines.filter((l) => /request failed/.test(l)).length, 0, lines.filter((l) => /request failed/.test(l)).join("\n"));
    for (const r of stub.requests) {
      assert.equal(r.method, "GET", `loops saw ${r.method} ${r.path}`);
      const [path] = r.path.split("?") as [string];
      assert.doesNotThrow(() => allowedLoopsPath(path), `loops saw a path off the list: ${r.path}`);
    }
    assert.ok((statuses.get(404) ?? 0) > 50 && (statuses.get(405) ?? 0) > 50 && (statuses.get(200) ?? 0) > 8, `the statuses seen: ${JSON.stringify([...statuses])}`);
    assertPrototypeClean(seed);
  });
});
