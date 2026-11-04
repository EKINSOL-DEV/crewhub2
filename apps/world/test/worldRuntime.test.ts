/* The world runtime (state/world.ts) through its interface: built from a config over `createDemoSource` with a manual
   demo scheduler and a fake frame clock, read through `state`, `subscribe` and its outlets (said, threads, the host's
   reconnect, the first snapshot). Round 59d, C3: the facts once pinned on reduceGap.ts (folded in) are here, with the
   start listener's routing (the held round 58d branch's routeMessage facts). C9 moved the demo DM read-back (and
   agentName's facts with it) to the demo chat adapter: test/chat.test.ts. */
import assert from "node:assert/strict";
import test from "node:test";
import { createDemoSource, createManualScheduler, type DemoSource } from "@crewhub/demo";
import type { ChatLine, ChatThreadFact, ConnectionState, ConnectionStatus, SourceMessage, WorldSource } from "@crewhub/loops-client";
import { createWorldRuntime, worldSources, type FrameClock } from "../src/state/world.ts";

/** A frame clock the test drives: frames and timers wait until the test runs them; `tick` ms pass on every read. */
function fakeClock() {
  const clock = {
    t: 1_000,
    tick: 0,
    hiddenPage: false,
    frames: [] as (() => void)[],
    timers: [] as { at: number; ms: number; fn: () => void }[],
    every: [] as { ms: number; fn: () => void }[],
    /** Runs the frames requested so far; returns how many ran. */
    runFrames(): number {
      const due = clock.frames.splice(0);
      for (const fn of due) fn();
      return due.length;
    },
    /** Moves the clock on, firing the timers that fall due. */
    advance(ms: number) {
      clock.t += ms;
      for (const timer of clock.timers.filter((x) => x.at <= clock.t)) {
        clock.timers.splice(clock.timers.indexOf(timer), 1);
        timer.fn();
      }
    },
  };
  const api: FrameClock = {
    now: () => (clock.t += clock.tick),
    frame: (fn) => void clock.frames.push(fn),
    after: (ms, fn) => void clock.timers.push({ at: clock.t + ms, ms, fn }),
    every: (ms, fn) => void clock.every.push({ ms, fn }),
    hidden: () => clock.hiddenPage,
  };
  return { clock, api };
}

/** What reached the outlets, in order. */
function outlets() {
  const got = { said: [] as ChatLine[], threads: [] as (readonly ChatThreadFact[])[], connected: 0, firstSnapshot: 0 };
  return {
    got,
    outlets: {
      said: (line: ChatLine) => void got.said.push(line),
      threads: (threads: readonly ChatThreadFact[]) => void got.threads.push(threads),
      hostConnected: () => void (got.connected += 1),
      firstSnapshot: () => void (got.firstSnapshot += 1),
    },
  };
}

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function demoWorld(options: { buildingLimit?: number; source?: (demo: DemoSource) => WorldSource } = {}) {
  const scheduler = createManualScheduler(0);
  const demo = createDemoSource({ scheduler, epochMs: 0 });
  const { clock, api } = fakeClock();
  const { got, outlets: out } = outlets();
  const source = options.source ? options.source(demo) : demo;
  const world = createWorldRuntime({ source, chat: demo, epochMs: 0, clock: api, buildingLimit: options.buildingLimit ?? NaN, outlets: out });
  return { world, demo, scheduler, clock, got };
}

/** Runs frames until none is asked for (a reduction can ask for none, or one more after it). */
function drain(clock: ReturnType<typeof fakeClock>["clock"]) {
  for (let i = 0; i < 10 && clock.runFrames() > 0; i += 1);
}

test("a burst of changes is one reduction on the next frame, and the listeners hear it once", () => {
  const { world, clock } = demoWorld();
  drain(clock);
  let heard = 0;
  world.subscribe(() => (heard += 1));
  const before = world.state;
  world.setRoleOverrides({ "cr-dev-1": "worker" });
  world.setReducedMotion(true);
  world.setZoning({ zones: [] } as never);
  assert.equal(clock.frames.length, 1, "one frame asked for, however many changes");
  assert.equal(world.state, before, "nothing reduced before the frame");
  assert.equal(clock.runFrames(), 1);
  assert.equal(heard, 1);
  assert.notEqual(world.state, before);
});

test("the next reduction waits 20 times the last one's cost after it, at most 200 ms; a free one waits for nothing", () => {
  const { world, clock } = demoWorld();
  drain(clock);
  // A reduction that costs 5 ms: the clock moves 5 ms on each read while the frame runs (its start and its end).
  world.setRoleOverrides({});
  clock.tick = 5;
  clock.runFrames();
  clock.tick = 0;
  world.setRoleOverrides({});
  assert.deepEqual([clock.frames.length, clock.timers.map((x) => x.ms)], [0, [100]], "100 ms after it: no frame yet");
  clock.advance(99);
  assert.equal(clock.frames.length, 0);
  clock.advance(1);
  assert.equal(clock.frames.length, 1, "due: the frame is asked for");
  world.setRoleOverrides({});
  assert.equal(clock.frames.length, 1, "still one frame while one is asked for");
  // A 50 ms reduction: capped at 200 ms.
  clock.tick = 50;
  clock.runFrames();
  clock.tick = 0;
  world.setRoleOverrides({});
  assert.deepEqual(clock.timers.map((x) => x.ms), [200]);
  world.setRoleOverrides({});
  assert.equal(clock.timers.length, 1, "one wait at a time");
  clock.advance(200);
  // A free reduction: the next change goes to the next frame at once.
  clock.runFrames();
  world.setRoleOverrides({});
  assert.deepEqual([clock.frames.length, clock.timers.length], [1, 0]);
});

test("the time tick re-reduces every second of wall time (every 250 ms while a drone flies), never on a hidden page", () => {
  const { world, clock } = demoWorld();
  drain(clock);
  assert.deepEqual(clock.every.map((x) => x.ms), [250]);
  const tick = clock.every[0]!.fn;
  tick();
  assert.equal(clock.frames.length, 0, "less than a second since the last reduction");
  clock.t += 1_000;
  clock.hiddenPage = true;
  tick();
  assert.equal(clock.frames.length, 0, "hidden");
  clock.hiddenPage = false;
  tick();
  assert.equal(clock.frames.length, 1);
  void world;
});

test("the same zoning (by value) schedules nothing; another zoning one reduction", () => {
  const { world, clock } = demoWorld();
  drain(clock);
  world.setZoning({});
  assert.equal(clock.frames.length, 0, "the empty zoning it starts with");
  const zoning = { zones: [{ id: "north", name: "North" }], assignments: {} } as never;
  world.setZoning(zoning);
  assert.equal(clock.runFrames(), 1);
  world.setZoning(JSON.parse(JSON.stringify(zoning)));
  assert.equal(clock.frames.length, 0, "equal by value: nothing");
  world.setReducedMotion(false);
  assert.equal(clock.frames.length, 0, "reduced motion as it is: nothing");
});

test("the building limit shows only the first N buildings; NaN shows them all", async () => {
  const all = demoWorld();
  const one = demoWorld({ buildingLimit: 1 });
  for (const w of [all, one]) {
    w.scheduler.advance(400_000);
    await settle(300);
    w.world.setRoleOverrides({});
    drain(w.clock);
  }
  const names = all.world.state.model.buildings.map((b) => b.slug);
  assert.ok(names.length > 1, `the demo has several buildings by then: ${names.join(", ")}`);
  assert.deepEqual(one.world.state.model.buildings.map((b) => b.slug), names.slice(0, 1));
  assert.deepEqual(one.world.state.text.length > 0, true, "the text view describes the limited model");
});

test("worldSources: the scenario's demo is also the dock's; live has no dock and a connection", () => {
  const scheduler = createManualScheduler(0);
  const demo = worldSources({ live: false, scenarioId: "studio", stressSize: null }, { scheduler, epochMs: 0 });
  assert.equal(demo.source, demo.chat);
  assert.equal((demo.chat as DemoSource).scenario.id, "studio");
  const live = worldSources({ live: true, scenarioId: "small-team", stressSize: 12 }, { scheduler, epochMs: 0 });
  assert.equal(live.chat, null);
  assert.equal(live.source.mode, "live");
  assert.ok(live.source.connection, "the host source reports its connection");
});

/** The demo with a captured listener, so a test can hand the runtime any message. */
function withListener(demo: DemoSource, extra: Partial<WorldSource> = {}) {
  const box: { emit: (m: SourceMessage) => void } = { emit: () => {} };
  const source = Object.create(demo, {
    start: {
      value: (listener: (m: SourceMessage) => void) => {
        box.emit = listener;
        return demo.start(listener);
      },
    },
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { value: v }])),
  }) as WorldSource;
  return { source, box };
}

test("a chat line goes to the said outlet only, the threads' facts to the threads outlet only; neither reaches the projection", () => {
  let captured!: ReturnType<typeof withListener>;
  const { world, got } = demoWorld({ source: (demo) => (captured = withListener(demo)).source });
  const version = world.projection.facts.version;
  const line: ChatLine = { agentId: "g-man", text: "Busy and calm.", at: "2026-11-04T10:00:00.000Z", messageId: "dm_2", threadId: "dmt_g" };
  captured.box.emit({ type: "chat", chat: line });
  const threads = [{ agentId: "g-man", lastMessageAt: "2026-11-04T10:00:00.000Z", unreadCount: 1 }] as unknown as ChatThreadFact[];
  captured.box.emit({ type: "threads", threads });
  assert.deepEqual(got.said, [line]);
  assert.deepEqual(got.threads, [threads]);
  assert.equal(world.projection.facts.version, version, "the projection never saw them");
});

test("the first snapshot is marked once; later snapshots (a seek) are not", () => {
  const { world, demo, scheduler, got } = demoWorld();
  assert.equal(got.firstSnapshot, 1);
  scheduler.advance(10_000);
  demo.playback.seek(0);
  assert.equal(got.firstSnapshot, 1);
  void world;
});

test("reconnect: the host-connected outlet fires each time the connection comes (back) to live, never while it stays live", () => {
  let state: ConnectionState = "connecting";
  const listeners = new Set<() => void>();
  const connection: ConnectionStatus = { state: () => state, key: () => null, onChange: (l) => (listeners.add(l), () => listeners.delete(l)) };
  const set = (next: ConnectionState) => {
    state = next;
    for (const l of listeners) l();
  };
  const { world, got } = demoWorld({ source: (demo) => withListener(demo, { connection }).source });
  assert.equal(world.connection, connection);
  set("live");
  assert.equal(got.connected, 1);
  set("live");
  assert.equal(got.connected, 1, "a key word change while live: nothing");
  set("stale");
  set("catching-up");
  assert.equal(got.connected, 1);
  set("live");
  assert.equal(got.connected, 2);
});

test("the demo has no connection: null", () => {
  const { world } = demoWorld();
  assert.equal(world.connection, null);
});
