/**
 * The fake's world origin (round 28, loops main CL-494 step 4): with `worldOrigin` set, a request whose Origin is the
 * world's passes only as a GET on the four routes, without an authorization header, the events poll with the two chat
 * types forced and the limit clamped, and every answer the route produced carries the three CORS headers (a 401 too);
 * anything else from that origin, and any other Origin, is 403 origin_forbidden with no CORS header. Unset, Origin
 * is ignored as before. Loopback only.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { WORLD_EVENTS_LIMIT, type LoopsFake, createLoopsFake } from "../src/index.ts";

const fakes: LoopsFake[] = [];
after(async () => {
  for (const fake of fakes) await fake.close();
});
async function fake(options: Parameters<typeof createLoopsFake>[0] = {}): Promise<LoopsFake> {
  const made = await createLoopsFake({ heartbeatMs: 60_000, ...options });
  fakes.push(made);
  return made;
}
const WORLD = "http://127.0.0.1:5283";
async function signIn(f: LoopsFake): Promise<string> {
  const response = await fetch(`${f.url}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: f.person.id, password: f.person.password }) });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie().map((c) => c.split(";")[0] as string).find((c) => c.startsWith("chl_session="))!;
}
const cors = (response: Response) => ({ origin: response.headers.get("access-control-allow-origin"), credentials: response.headers.get("access-control-allow-credentials"), vary: response.headers.get("vary") });

test("the world origin: the four GETs with the cookie answer with the three CORS headers; a 401 carries them too", async () => {
  const f = await fake({ worldOrigin: WORLD });
  const cookie = await signIn(f);
  for (const path of ["/api/dm/threads", "/api/dm/threads/cr-lead/messages", "/api/events?types=dm.created,dm.answered&limit=50&from=tail"]) {
    const response = await fetch(`${f.url}${path}`, { headers: { origin: WORLD, cookie } });
    assert.equal(response.status, 200, path);
    assert.deepEqual(cors(response), { origin: WORLD, credentials: "true", vary: "Origin" }, path);
  }
  const tail = (await (await fetch(`${f.url}/api/events?from=tail`, { headers: { origin: WORLD, cookie } })).json()) as { cursor: string };
  assert.equal(typeof tail.cursor, "string");
  const next = await fetch(`${f.url}/api/events?cursor=${encodeURIComponent(tail.cursor)}&types=dm.created`, { headers: { origin: WORLD, cookie } });
  assert.equal(next.status, 200, "the sealed cursor and a subset of the two types");
  const signedOut = await fetch(`${f.url}/api/dm/threads`, { headers: { origin: WORLD } });
  assert.equal(signedOut.status, 401);
  assert.deepEqual(cors(signedOut), { origin: WORLD, credentials: "true", vary: "Origin" }, "a 401 through the origin is readable by the page");
});

test("the world origin: anything else is 403 origin_forbidden with no CORS header: another route, a POST, a key, a foreign event type, OPTIONS; another Origin too", async () => {
  const f = await fake({ worldOrigin: WORLD });
  const cookie = await signIn(f);
  const refused = async (path: string, init: RequestInit, why: string) => {
    const response = await fetch(`${f.url}${path}`, init);
    assert.equal(response.status, 403, why);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, "origin_forbidden", why);
    assert.deepEqual(cors(response), { origin: null, credentials: null, vary: null }, `${why}: no CORS header`);
  };
  await refused("/api/projects", { headers: { origin: WORLD, cookie } }, "another route");
  await refused("/api/dm/threads/cr-lead/messages", { method: "POST", headers: { origin: WORLD, cookie, "content-type": "application/json" }, body: "{}" }, "a write");
  await refused("/api/dm/threads", { headers: { origin: WORLD, authorization: `Bearer ${f.key}` } }, "a key from the page");
  await refused("/api/events?types=ticket.moved", { headers: { origin: WORLD, cookie } }, "a foreign event type");
  await refused("/api/dm/threads", { method: "OPTIONS", headers: { origin: WORLD, "access-control-request-method": "GET" } }, "a pre-flight");
  await refused("/api/dm/threads", { headers: { origin: "http://127.0.0.1:5999", cookie } }, "another origin");
  const none = await fetch(`${f.url}/api/dm/threads`, { headers: { cookie } });
  assert.equal(none.status, 200, "no Origin (the host, curl): as before");
  assert.equal(none.headers.get("access-control-allow-origin"), null);
});

test("the world origin: the events poll's limit is clamped to 50 and the types forced; unset, Origin is ignored; setWorldOrigin changes it live", async () => {
  const f = await fake({ worldOrigin: WORLD });
  const cookie = await signIn(f);
  const big = await fetch(`${f.url}/api/events?limit=500`, { headers: { origin: WORLD, cookie } });
  assert.equal(big.status, 200, "a larger limit is clamped, not refused");
  assert.equal(WORLD_EVENTS_LIMIT, 50);
  f.setWorldOrigin(null);
  const ignored = await fetch(`${f.url}/api/projects`, { headers: { origin: "http://127.0.0.1:5999", cookie } });
  assert.equal(ignored.status, 200, "unset: Origin is ignored as before");
  assert.equal(ignored.headers.get("access-control-allow-origin"), null);
  f.setWorldOrigin("http://127.0.0.1:6001");
  const other = await fetch(`${f.url}/api/dm/threads`, { headers: { origin: "http://127.0.0.1:6001", cookie } });
  assert.equal(other.headers.get("access-control-allow-origin"), "http://127.0.0.1:6001");
});
