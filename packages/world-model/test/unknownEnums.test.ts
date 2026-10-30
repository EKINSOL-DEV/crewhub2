/*
 * Round 48 (r48-enums, r48-live's L1), end to end: a host whose snapshot carries values crewhub-loops added after this
 * build (a project icon and colour, a card's priority, a principal kind, the watchdog's mode) still gives a town. The
 * live source (`createHostSource`) reads the snapshot from a small in-test host on 127.0.0.1 port 0 (loopback to a
 * server the test starts: not a network call), the projection takes it, and the reducer draws the building, with no
 * mark for the icon and colour it cannot name. Before, the snapshot failed to validate and the page stayed connecting.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createHostSource, resetWarnings } from "@crewhub/loops-client";
import { emptyMemory } from "../src/memory.ts";
import { Projection } from "../src/projection.ts";
import { reduceWorld } from "../src/reducer.ts";

const fixture = (name: string): Record<string, any> =>
  JSON.parse(readFileSync(new URL(`../../loops-client/test/fixtures/${name}`, import.meta.url), "utf8")) as Record<string, any>;

function snapshotWithNewValues(): Record<string, unknown> {
  const projects = fixture("projects.json").projects;
  projects[0].icon = "rocket";
  projects[0].color = "sage";
  const board = fixture("board.json");
  board.columns.find((c: { tickets: unknown[] }) => c.tickets.length > 0).tickets[0].priority = "critical";
  const watchdog = fixture("watchdog.json");
  watchdog.mode = "escalate";
  return {
    cursor: 5,
    projects,
    archivedProjects: [],
    boards: { [projects[0].slug]: board },
    team: fixture("team-snapshot.json"),
    agents: fixture("agents.json").agents,
    principals: [
      { id: "cl-lead", kind: "agent", displayName: "CL lead" },
      { id: "ci", kind: "service", displayName: "CI" },
    ],
    watchdog,
    milestones: {},
    releases: {},
  };
}

test("round 48 (r48-enums): a snapshot with values this build does not know loads a town through the live source", async (t) => {
  resetWarnings();
  const warn = t.mock.method(console, "warn", () => undefined);
  const body = snapshotWithNewValues();
  let snapshots = 0;
  const streams = new Set<ServerResponse>();
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const json = (status: number, value: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (path === "/world-api/snapshot") {
      snapshots += 1;
      return json(200, body);
    }
    if (path === "/world-api/team") return json(200, fixture("team-snapshot.json"));
    if (path === "/world-api/stream") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ type: "status", loops: "ok" })}\n\n`);
      streams.add(res);
      req.on("close", () => streams.delete(res));
      return;
    }
    return json(404, { error: "not_found" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const source = createHostSource({ baseUrl: url, timings: { staleMs: 60_000, teamPollMs: 60_000, retryMinMs: 10, retryMaxMs: 20 } });
  const projection = new Projection(source);
  const stop = source.start((message) => projection.apply(message));
  try {
    const deadline = Date.now() + 3000;
    while (source.connection!.state() !== "live") {
      if (Date.now() > deadline) assert.fail(`the source never went live: ${source.connection!.state()} after ${snapshots} snapshot ask(s)`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(snapshots, 1, "one snapshot ask: the first answer was taken");
    const model = reduceWorld(projection.facts, emptyMemory(), { now: source.now(), mode: "live", roleOverrides: {} }).model;
    const slug = (body.projects as { slug: string }[])[0]!.slug;
    const building = model.buildings.find((b) => b.slug === slug);
    assert.ok(building, `the building ${slug} stands`);
    assert.equal(building.icon, null, "an icon the world cannot name is no icon");
    assert.equal(building.color, null, "a colour the world cannot name is no colour");
    assert.ok(building.objects.length > 0, "the board's tickets are on it");
    assert.ok(building.objects.every((o) => o.priorityTag === null), "a priority the world does not know tags nothing");
    const warned = warn.mock.calls.map((c) => String(c.arguments[0]));
    assert.ok(warned.some((w) => /unknown project icon "rocket"/.test(w)), `the console says so once: ${warned.join(" | ")}`);
  } finally {
    stop();
    for (const res of streams) res.end();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
