/** The wire between the host and the page (`src/hostWire.ts`), read and built through its interface alone. */
import assert from "node:assert/strict";
import test from "node:test";
import { WORLD_API_PREFIX, WORLD_ROUTES, isSegment, worldApiPath } from "../src/hostWire.ts";

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
