/**
 * Walk finding w3-6 (round 64): a reopened stream says Live only after a heartbeat or an event came through it. The host
 * answers the open of a stream at once, whatever loops is doing: a comment, a status from its own memory, the threads. So
 * with loops frozen (not closed) the chip went Live, Stale at 40 s and Live again at 46 s, while nothing had come from loops.
 * A small in-test host greets a stream as `apps/host` does (`host.ts` `stream`, `connection.ts` `attach`); the source's
 * clocks run under mock timers and the test ticks them, so the machine's speed decides nothing.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, type TestContext, test } from "node:test";
import { createHostSource } from "../src/hostSource.ts";
import { worldApiPath } from "../src/hostWire.ts";
import type { ConnectionState, HostSourceOptions, LoopsSnapshot, SourceMessage } from "../src/source.ts";

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as Record<string, unknown>;

const STALE_MS = 150;
const RETRY_MS = 10;
const TIMINGS = { staleMs: STALE_MS, teamPollMs: 60_000, retryMinMs: RETRY_MS, retryMaxMs: RETRY_MS };
const CEILING_MS = 30_000;
const BEAT = { type: "heartbeat", seq: 100, ts: "2026-11-05T12:00:00Z" };

function snapshotAt(cursor: number): LoopsSnapshot {
  return {
    cursor,
    projects: (fixture("projects.json") as { projects: LoopsSnapshot["projects"] }).projects,
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

const envelope = (seq: number): Record<string, unknown> => ({ ...fixture("envelope-ticket-moved.json"), seq, ts: "2026-11-05T12:00:00Z" });

const servers: Server[] = [];
const stops: (() => void)[] = [];
after(async () => {
  for (const stop of stops) stop();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

/** A host that greets every stream as `apps/host` does and then says only what the test pushes. */
async function startHost() {
  const streams = new Set<ServerResponse>();
  const host = {
    url: "",
    opened: 0,
    snapshots: 0,
    push(message: unknown) {
      for (const stream of streams) stream.write(`data: ${JSON.stringify(message)}\n\n`);
    },
    endStreams() {
      for (const stream of streams) stream.end();
      streams.clear();
    },
  };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url ?? "/", "http://host").pathname;
    if (path === worldApiPath("/snapshot")) {
      host.snapshots += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(snapshotAt(100)));
      return;
    }
    if (path === worldApiPath("/stream")) {
      host.opened += 1;
      res.writeHead(200, { "content-type": "text/event-stream" });
      // host.ts `stream`, connection.ts `attach`, stream.ts `subscribe`: the host's own words, with nothing from loops in them.
      res.write(":ok\n\n");
      res.write(`data: ${JSON.stringify({ type: "status", loops: "ok", key: "ok" })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "threads", threads: [] })}\n\n`);
      streams.add(res);
      req.on("close", () => streams.delete(res));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end("{}");
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  host.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return host;
}

/** Waits on real I/O turns only, so it works under mock timers. */
async function settle(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + CEILING_MS;
  while (!check()) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function observe(url: string, extra: HostSourceOptions = {}) {
  const messages: SourceMessage[] = [];
  const states: ConnectionState[] = [];
  const source = createHostSource({ baseUrl: url, ...extra }, { timings: TIMINGS });
  // A change of the key's word notifies too: the list holds the changes of the state alone.
  source.connection!.onChange(() => {
    const state = source.connection!.state();
    if (states.at(-1) !== state) states.push(state);
  });
  const stop = source.start((message) => messages.push(message));
  stops.push(stop);
  return { messages, states, stop, state: () => source.connection!.state() };
}

const count = (messages: SourceMessage[], type: SourceMessage["type"]) => messages.filter((m) => m.type === type).length;

/** A live source on an open, greeted stream, then `staleMs` of silence and a reopened stream, greeted too: the walk's 46 s. */
async function staleAndReopened(t: TestContext, extra: HostSourceOptions = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const host = await startHost();
  const run = observe(host.url, extra);
  t.after(() => {
    run.stop();
    t.mock.timers.reset();
  });
  await settle(() => run.state() === "live" && count(run.messages, "threads") === 1, "live, the first stream greeted");
  t.mock.timers.tick(STALE_MS);
  assert.equal(run.state(), "stale", "stale at staleMs of silence");
  // The back-off's timer is set a few I/O turns after the stale: tick until the new ask arrives.
  await settle(() => {
    if (host.opened < 2) t.mock.timers.tick(RETRY_MS);
    return host.opened === 2 && count(run.messages, "threads") === 2;
  }, "the reopened stream greeted");
  return { host, run, tick: (ms: number) => t.mock.timers.tick(ms) };
}

test("the first stream after a snapshot stays Live through its greeting: the snapshot came from loops", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const host = await startHost();
  const run = observe(host.url);
  t.after(() => {
    run.stop();
    t.mock.timers.reset();
  });
  await settle(() => count(run.messages, "threads") === 1, "the greeting");
  assert.equal(run.state(), "live");
  assert.deepEqual(run.states, ["live"]);
});

test("a stream reopened after silence: its greeting (the comment, the host's status, the threads) does not say Live; a heartbeat does", async (t) => {
  const { host, run } = await staleAndReopened(t);
  assert.equal(run.state(), "stale", "nothing has come through the new stream yet");
  host.push(BEAT);
  await settle(() => count(run.messages, "heartbeat") === 1, "the heartbeat");
  assert.equal(run.state(), "live", "a heartbeat on the new stream");
  assert.deepEqual(run.states, ["live", "stale", "live"]);
  assert.equal(host.snapshots, 1, "healed at the cursor, no new snapshot");
});

test("a stream reopened after silence: an event says Live", async (t) => {
  const { host, run } = await staleAndReopened(t);
  host.push({ type: "event", envelope: envelope(101) });
  await settle(() => count(run.messages, "event") === 1, "the event");
  assert.equal(run.state(), "live");
});

test("a stream reopened after silence: the host's own town and chat words, a replayed seq and a message that does not validate do not say Live", async (t) => {
  const towns: number[] = [];
  const { host, run } = await staleAndReopened(t, { onTown: (rev) => towns.push(rev) });
  host.push({ type: "town", rev: 3 });
  host.push({ type: "chat", chat: { agentId: "cl-lead", text: "hello", at: "2026-11-05T12:00:00Z", messageId: "m1", threadId: "t1" } });
  host.push({ type: "event", envelope: envelope(100) });
  host.push({ type: "heartbeat", seq: "not a seq", ts: "2026-11-05T12:00:00Z" });
  host.push({ type: "threads", threads: [] });
  await settle(() => count(run.messages, "threads") === 3, "the threads sent after the others");
  assert.deepEqual(towns, [3], "the town message was read");
  assert.equal(count(run.messages, "chat"), 1, "the chat line was read");
  assert.equal(run.state(), "stale");
  assert.ok(!run.states.slice(2).includes("live"), `states ${run.states.join(",")}`);
});

test("loops stays silent: the reopened stream goes stale again unsaid and is reopened again, Live never said; then loops down, as the walk's frozen loops", async (t) => {
  const { host, run, tick } = await staleAndReopened(t);
  tick(STALE_MS);
  await settle(() => {
    if (host.opened < 3) tick(RETRY_MS);
    return host.opened === 3 && count(run.messages, "threads") === 3;
  }, "a third stream, the second's silence healed too");
  assert.equal(run.state(), "stale");
  host.push({ type: "status", loops: "down" });
  await settle(() => run.state() === "loops-down", "loops down");
  assert.deepEqual(run.states, ["live", "stale", "loops-down"], "no Live between Stale and Loops down");
});

test("a stream the host ended and the next one's greeting: Stale until a heartbeat, as after silence", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const host = await startHost();
  const run = observe(host.url);
  t.after(() => {
    run.stop();
    t.mock.timers.reset();
  });
  await settle(() => count(run.messages, "threads") === 1, "the first greeting");
  host.endStreams();
  await settle(() => {
    if (host.opened < 2) t.mock.timers.tick(RETRY_MS);
    return host.opened === 2 && count(run.messages, "threads") === 2;
  }, "the second greeting");
  assert.equal(run.state(), "stale");
  host.push(BEAT);
  await settle(() => run.state() === "live", "live on the heartbeat");
  assert.deepEqual(run.states, ["live", "stale", "live"]);
});
