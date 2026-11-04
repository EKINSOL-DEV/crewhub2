/** The wire between the host and the page (`src/hostWire.ts`), read and built through its interface alone. */
import assert from "node:assert/strict";
import test from "node:test";
import { WORLD_API_PREFIX, WORLD_ROUTES, isSegment, readHostHealth, worldApiPath } from "../src/hostWire.ts";

test("worldApiPath builds the page's path from the one table: the prefix, the segments encoded, the query the route takes", () => {
  assert.equal(worldApiPath("/health"), `${WORLD_API_PREFIX}/health`);
  assert.equal(worldApiPath("/tickets/{ref}", { ref: "CL-85" }), "/world-api/tickets/CL-85");
  assert.equal(worldApiPath("/tickets/{ref}/comments", { ref: "CL 85/x" }), "/world-api/tickets/CL%2085%2Fx/comments", "a segment is encoded, never spliced");
  assert.equal(worldApiPath("/town/backups/{name}", { name: "world.db.bak-v2" }), "/world-api/town/backups/world.db.bak-v2");
  assert.equal(worldApiPath("/stream", {}, { cursor: "-1" }), "/world-api/stream?cursor=-1", "the cursor the source resumes at, -1 before the first");
  assert.equal(worldApiPath("/projects/{slug}/milestones", { slug: "atlas" }, { limit: "50" }), "/world-api/projects/atlas/milestones?limit=50");
  assert.throws(() => worldApiPath("/health", {}, { cursor: "1" }), /takes no query parameter cursor/, "a query the route drops is the page's error, said here");
});

test("every pattern of the table builds a path the host's matcher accepts; a segment the rule refuses is refused by both", () => {
  for (const route of WORLD_ROUTES) {
    const params = Object.fromEntries([...route.pattern.matchAll(/\{(\w+)\}/g)].map((m) => [m[1] as string, "CL-1"]));
    const path = worldApiPath(route.pattern as Parameters<typeof worldApiPath>[0], params);
    assert.ok(path.startsWith(`${WORLD_API_PREFIX}/`), path);
    assert.ok(!path.includes("{"), `${path}: a segment left unfilled`);
  }
  assert.ok(isSegment("CL-111.2") && isSegment("tk_abc") && isSegment("ops-tooling"));
  assert.ok(!isSegment("") && !isSegment(".hidden") && !isSegment("a/b") && !isSegment(7) && !isSegment("x".repeat(129)));
});

test("readHostHealth keeps a host's whole answer, the dev origins included, and nothing it does not know", () => {
  const sent = {
    loops: "ok",
    keyName: "crewhub-world",
    sharedKey: false,
    loopsWebUrl: "http://127.0.0.1:5384",
    paired: true,
    pairing: "on",
    connection: { discovery: { state: "found", via: "env-url" }, key: { state: "ok", name: "crewhub-world", source: "stored" }, stream: { state: "ok", reconnects: 0, cursor: 12 }, archived: { source: "none", count: 0 }, snapshot: { state: "idle" } },
    checkout: "0a1b2c3d",
    devOrigins: ["http://127.0.0.1:5383"],
    loopsCommit: "4cdcd383",
    loopsCommitBefore: "053b5f47",
    cursor: 12,
    transport: "unix",
  };
  assert.deepEqual(readHostHealth(sent), sent, "every field a current host writes comes through as it was");
  const { loopsWebUrl: _url, checkout: _checkout, transport: _transport, ...rest } = sent;
  const odd = readHostHealth({ ...sent, secret: "chl_never", loopsWebUrl: "javascript:alert(1)", checkout: "not-hex", devOrigins: ["http://127.0.0.1:1", 7], transport: "carrier-pigeon" });
  assert.deepEqual(odd, { ...rest, devOrigins: ["http://127.0.0.1:1"] }, "a field in a shape the page does not know is dropped, never passed on");
  assert.ok(!JSON.stringify(odd).includes("chl_"), "an unknown field never passes (it could be a secret)");
});

test("readHostHealth reads a host from before (states only) and answers null for anything that is not a host's", () => {
  assert.deepEqual(readHostHealth({ loops: "down", keyName: "", sharedKey: false }), { loops: "down", keyName: "", sharedKey: false });
  assert.equal(readHostHealth({ loops: "sleeping", keyName: "x" }), null, "a loops word the page does not know is no host");
  assert.equal(readHostHealth({ loops: "ok" }), null, "without the key's name it is no host");
  assert.equal(readHostHealth(null), null);
  assert.equal(readHostHealth("ok"), null);
});
