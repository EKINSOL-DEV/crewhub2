/**
 * HostSource against a small in-test host that speaks the team map's `/world-api` on 127.0.0.1 port 0
 * (loopback to a server the test starts: not a network call). The timings are injected so a test runs in
 * tens of milliseconds where the browser waits seconds.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { createHostSource, probeHost } from "../src/hostSource.ts";
import type { ConnectionState, LoopsSnapshot, SourceMessage } from "../src/source.ts";

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as Record<string, unknown>;

const TIMINGS = { staleMs: 150, teamPollMs: 60_000, retryMinMs: 10, retryMaxMs: 20 };

function snapshotAt(cursor: number): LoopsSnapshot {
  const projects = (fixture("projects.json") as { projects: LoopsSnapshot["projects"] }).projects;
  return {
    cursor,
    projects,
    archivedProjects: [],
    boards: { "crewhub-loops": fixture("board.json") as unknown as LoopsSnapshot["boards"][string] },
    team: fixture("team-snapshot.json") as unknown as LoopsSnapshot["team"],
    agents: (fixture("agents.json") as { agents: LoopsSnapshot["agents"] }).agents,
    principals: [{ id: "cl-lead", kind: "agent", displayName: "CL lead" }],
    watchdog: fixture("watchdog.json") as unknown as LoopsSnapshot["watchdog"],
    milestones: { "crewhub-loops": (fixture("milestones.json") as { milestones: LoopsSnapshot["milestones"][string] }).milestones },
    releases: { "crewhub-loops": (fixture("releases.json") as { releases: LoopsSnapshot["releases"][string] }).releases },
  };
}

function envelope(seq: number, type = "ticket.moved"): Record<string, unknown> {
  return { ...fixture("envelope-ticket-moved.json"), seq, type, ts: `2026-10-07T12:00:${String(seq % 60).padStart(2, "0")}Z` };
}

interface FakeHost {
  url: string;
  /** Every stream request's `cursor`, in order. */
  cursors: (string | null)[];
  snapshots: number;
  teamReads: number;
  cursor: number;
  snapshotStatus: number;
  /** Sends one message on every open stream. */
  push(message: unknown): void;
  /** Ends every open stream (the host restarted). */
  endStreams(): void;
  close(): Promise<void>;
}

const servers: Server[] = [];
after(async () => {
  for (const server of servers) await new Promise((resolve) => server.close(resolve));
});

async function startHost(): Promise<FakeHost> {
  const streams = new Set<ServerResponse>();
  const host: FakeHost = {
    url: "",
    cursors: [],
    snapshots: 0,
    teamReads: 0,
    cursor: 100,
    snapshotStatus: 200,
    push(message) {
      const text = JSON.stringify(message);
      for (const stream of streams) stream.write(`data: ${text}\n\n`);
    },
    endStreams() {
      for (const stream of streams) stream.end();
      streams.clear();
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", host.url);
    if (url.pathname === "/world-api/health") return json(res, 200, { loops: "ok", keyName: "agent-crewhub-world", sharedKey: false, cursor: host.cursor });
    if (url.pathname === "/world-api/snapshot") {
      host.snapshots += 1;
      if (host.snapshotStatus !== 200) return json(res, host.snapshotStatus, { error: "loops_down" });
      return json(res, 200, snapshotAt(host.cursor));
    }
    if (url.pathname === "/world-api/team") {
      host.teamReads += 1;
      return json(res, 200, fixture("team-snapshot.json"));
    }
    if (url.pathname === "/world-api/stream") {
      host.cursors.push(url.searchParams.get("cursor"));
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.write(`: welcome\ndata: ${JSON.stringify({ type: "status", loops: "ok" })}\n\n`);
      streams.add(res);
      req.on("close", () => streams.delete(res));
      return;
    }
    if (url.pathname === "/world-api/tickets/CL-85") return json(res, 200, { ticket: fixture("ticket.json") });
    if (url.pathname === "/world-api/projects/crewhub-loops/milestones") return json(res, 409, { error: "feature_off" });
    if (url.pathname === "/world-api/project-groups") return json(res, 200, { groups: [] });
    return json(res, 404, { error: "not_found" });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  host.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return host;
}

/** Runs a source and collects what it sends; resolves helpers wait for a condition with a short deadline. */
function observe(url: string, extra: Record<string, unknown> = {}) {
  const messages: SourceMessage[] = [];
  const states: ConnectionState[] = [];
  const source = createHostSource({ baseUrl: url, timings: TIMINGS, ...extra });
  source.connection!.onChange(() => states.push(source.connection!.state()));
  const stop = source.start((message) => messages.push(message));
  const until = async (check: () => boolean, what: string, ms = 2000): Promise<void> => {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}; messages ${messages.map((m) => m.type).join(",")}; states ${states.join(",")}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  return { source, messages, states, stop, until, state: () => source.connection!.state() };
}

const count = (messages: SourceMessage[], type: SourceMessage["type"]) => messages.filter((m) => m.type === type).length;

test("snapshot first, then events in seq order; the connection goes connecting → live", async () => {
  const host = await startHost();
  const run = observe(host.url);
  assert.equal(run.source.mode, "live");
  assert.equal(run.source.playback, null);
  assert.equal(run.state(), "connecting");
  await run.until(() => run.messages.length === 1, "the snapshot");
  assert.equal(run.messages[0]?.type, "snapshot");
  if (run.messages[0]?.type === "snapshot") assert.equal(run.messages[0].snapshot.cursor, 100);
  assert.equal(run.state(), "live");
  await run.until(() => host.cursors.length === 1, "the stream");
  host.push({ type: "event", envelope: envelope(101) });
  host.push({ type: "event", envelope: envelope(102) });
  await run.until(() => count(run.messages, "event") === 2, "two events");
  const seqs = run.messages.filter((m) => m.type === "event").map((m) => (m.type === "event" ? m.envelope.seq : 0));
  assert.deepEqual(seqs, [101, 102]);
  assert.ok(Math.abs(run.source.now() - Date.now()) < 1000);
  run.stop();
  await host.close();
});

test("a replayed seq is skipped; an invalid envelope is skipped, nothing throws", async () => {
  const host = await startHost();
  const run = observe(host.url);
  await run.until(() => host.cursors.length === 1, "the stream");
  host.push({ type: "event", envelope: envelope(101) });
  host.push({ type: "event", envelope: envelope(101) });
  host.push({ type: "event", envelope: { ...envelope(102), v: 2 } });
  host.push({ type: "event", envelope: envelope(102) });
  host.push("not an object");
  await run.until(() => count(run.messages, "event") === 2, "two events");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(count(run.messages, "event"), 2);
  assert.equal(run.state(), "live");
  run.stop();
  await host.close();
});

test("the stream reconnects with ?cursor=<last seq> after the host ends it", async () => {
  const host = await startHost();
  const run = observe(host.url);
  await run.until(() => host.cursors.length === 1, "the stream");
  assert.equal(host.cursors[0], "100");
  host.push({ type: "event", envelope: envelope(101) });
  await run.until(() => count(run.messages, "event") === 1, "the event");
  host.endStreams();
  await run.until(() => host.cursors.length === 2, "the reconnect");
  assert.equal(host.cursors[1], "101");
  assert.equal(host.snapshots, 1, "no new snapshot on a plain reconnect");
  run.stop();
  await host.close();
});

test("a reset message → catching-up, a fresh snapshot, then live", async () => {
  const host = await startHost();
  const run = observe(host.url);
  await run.until(() => host.cursors.length === 1, "the stream");
  host.cursor = 300;
  host.push({ type: "reset", reason: "gone" });
  await run.until(() => count(run.messages, "snapshot") === 2, "the second snapshot");
  assert.ok(run.states.includes("catching-up"), run.states.join(","));
  assert.equal(run.state(), "live");
  await run.until(() => host.cursors.length === 2, "the new stream");
  assert.equal(host.cursors[1], "300");
  run.stop();
  await host.close();
});

test("a seq gap → catching-up and a fresh snapshot", async () => {
  const host = await startHost();
  const run = observe(host.url);
  await run.until(() => host.cursors.length === 1, "the stream");
  host.cursor = 105;
  host.push({ type: "event", envelope: envelope(101) });
  host.push({ type: "event", envelope: envelope(105) });
  await run.until(() => count(run.messages, "snapshot") === 2, "the second snapshot");
  assert.ok(run.states.includes("catching-up"));
  assert.equal(count(run.messages, "event"), 1, "the event past the gap is not delivered; the snapshot holds it");
  await run.until(() => host.cursors.length === 2, "the new stream");
  assert.equal(host.cursors[1], "105");
  run.stop();
  await host.close();
});

test("heartbeats keep it live; silence past staleMs → stale; the next message → live", async () => {
  const host = await startHost();
  const run = observe(host.url);
  await run.until(() => host.cursors.length === 1, "the stream");
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    host.push({ type: "heartbeat", seq: 100, ts: "2026-10-07T12:00:00Z" });
  }
  assert.equal(run.state(), "live");
  assert.ok(count(run.messages, "heartbeat") >= 5);
  await run.until(() => run.state() === "stale", "stale", 1000);
  host.push({ type: "heartbeat", seq: 100, ts: "2026-10-07T12:00:30Z" });
  await run.until(() => run.state() === "live", "live again");
  run.stop();
  await host.close();
});

test("status messages → loops-down / unauthorized; ok again re-snapshots", async () => {
  const host = await startHost();
  const run = observe(host.url);
  await run.until(() => host.cursors.length === 1, "the stream");
  host.push({ type: "status", loops: "down" });
  await run.until(() => run.state() === "loops-down", "loops-down");
  host.push({ type: "status", loops: "unauthorized" });
  await run.until(() => run.state() === "unauthorized", "unauthorized");
  host.push({ type: "status", loops: "ok" });
  await run.until(() => count(run.messages, "snapshot") === 2 && run.state() === "live", "re-snapshot and live");
  run.stop();
  await host.close();
});

test("a 503 snapshot → loops-down and retries until it answers", async () => {
  const host = await startHost();
  host.snapshotStatus = 503;
  const run = observe(host.url);
  await run.until(() => run.state() === "loops-down", "loops-down");
  await run.until(() => host.snapshots >= 2, "a retry");
  host.snapshotStatus = 200;
  await run.until(() => run.state() === "live", "live");
  assert.equal(count(run.messages, "snapshot"), 1);
  run.stop();
  await host.close();
});

test("a host that stops answering → stale, then it recovers at the cursor", async () => {
  const host = await startHost();
  const run = observe(host.url);
  await run.until(() => host.cursors.length === 1, "the stream");
  host.push({ type: "event", envelope: envelope(101) });
  await run.until(() => count(run.messages, "event") === 1, "the event");
  host.endStreams();
  await host.close();
  await run.until(() => run.state() === "stale", "stale");
  run.stop();
});

test("team.updated → GET /world-api/team and a team message; the stop ends everything", async () => {
  const host = await startHost();
  const run = observe(host.url);
  await run.until(() => host.cursors.length === 1, "the stream");
  host.push({ type: "event", envelope: { ...envelope(101, "team.updated"), ticket: null, payload: {} } });
  await run.until(() => count(run.messages, "team") === 1, "the team message");
  assert.equal(host.teamReads, 1);
  run.stop();
  const before = run.messages.length;
  host.push({ type: "event", envelope: envelope(102) });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(run.messages.length, before);
  await host.close();
});

test("reads: ticket {ticket}, 404 → null, 409 feature_off → [], groups []", async () => {
  const host = await startHost();
  const source = createHostSource({ baseUrl: host.url, timings: TIMINGS });
  assert.equal((await source.getTicket("CL-85"))?.key, "CL-85");
  assert.equal(await source.getTicket("CL-999"), null);
  assert.equal(await source.getProject("nope"), null);
  assert.deepEqual(await source.getMilestones("crewhub-loops"), []);
  assert.deepEqual(await source.listProjectGroups(), []);
  await host.close();
});

test("probeHost answers the health, and null when nothing listens or the answer is not a host's", async () => {
  const host = await startHost();
  const health = await probeHost(host.url, 500);
  assert.deepEqual(health, { loops: "ok", keyName: "agent-crewhub-world", sharedKey: false, cursor: 100 });
  await host.close();
  assert.equal(await probeHost(host.url, 500), null);
  const other = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  servers.push(other);
  await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
  assert.equal(await probeHost(`http://127.0.0.1:${(other.address() as AddressInfo).port}`, 500), null);
});
