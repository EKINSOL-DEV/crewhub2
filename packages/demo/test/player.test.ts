/**
 * The player through its interface, on a timeline written here (lines at given times, every call recorded). The two
 * real adapters keep their own tests: timeline.test.ts and seek.test.ts for the storyline, stress.test.ts for the stream.
 * The player never looks inside a message, so a line is a heartbeat whose `seq` is its time.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceMessage } from "@crewhub/loops-client";
import { type PlayerOptions, type Timeline, createPlayer } from "../src/player.ts";
import { createManualScheduler } from "../src/scheduler.ts";

const DURATION = 10_000;
const EPOCH = 1_000_000;
const SNAPSHOT: SourceMessage = { type: "heartbeat", seq: -1, ts: "snapshot" };

function timelineOf(lines: number[], extra: Partial<Timeline> = {}) {
  const calls: string[] = [];
  let next = 0;
  const timeline: Timeline = {
    durationMs: DURATION,
    rebuild(to, loop, base) {
      calls.push(`rebuild ${to} loop ${loop} base ${base}`);
      next = lines.filter((at) => at <= to).length;
    },
    nextAt: () => lines[next] ?? Infinity,
    playNext(base) {
      const at = lines[next] as number;
      next += 1;
      calls.push(`line ${at} base ${base}`);
      return [{ type: "heartbeat", seq: at, ts: "line" }];
    },
    snapshot() {
      calls.push("snapshot");
      return SNAPSHOT;
    },
    beforeLoop: () => calls.push("beforeLoop"),
    ...extra,
  };
  return { timeline, calls };
}

function play(lines: number[], options: Partial<PlayerOptions> = {}) {
  const scheduler = createManualScheduler(500);
  const { timeline, calls } = timelineOf(lines);
  const player = createPlayer(timeline, { scheduler, epochMs: EPOCH, ...options });
  const heard: SourceMessage[] = [];
  const said = () => heard.map((m) => (m.type === "heartbeat" ? m.seq : m.type));
  return { scheduler, calls, player, playback: player.playback, heard, said };
}

test("made: rebuilt at the start position, at speed 1 by default, the clock at the epoch plus the position", () => {
  const { calls, player, playback } = play([]);
  assert.deepEqual(calls, [`rebuild 0 loop 0 base ${EPOCH}`]);
  assert.equal(playback.positionMs(), 0);
  assert.equal(playback.speed(), 1);
  assert.equal(playback.loop(), 0);
  assert.equal(playback.durationMs, DURATION);
  assert.equal(player.now(), EPOCH);
  const later = play([], { startAt: 2_000.4, speed: 4 });
  assert.deepEqual(later.calls, [`rebuild 2000 loop 0 base ${EPOCH}`]);
  assert.equal(later.player.now(), EPOCH + 2_000);
  assert.equal(later.playback.speed(), 4);
});

test("pause stops the clock; speed multiplies it; a line plays when the position reaches it, not before", () => {
  const { scheduler, player, playback, heard, said } = play([1_000, 1_400], { speed: 4 });
  player.start((m) => heard.push(m));
  scheduler.advance(200);
  assert.equal(playback.positionMs(), 800);
  assert.deepEqual(said(), [-1]);
  scheduler.advance(100);
  assert.equal(playback.positionMs(), 1_200);
  assert.deepEqual(said(), [-1, 1_000]);
  playback.setSpeed(0);
  let changes = 0;
  const off = playback.onChange(() => (changes += 1));
  scheduler.advance(5_000);
  assert.equal(playback.positionMs(), 1_200);
  assert.deepEqual(said(), [-1, 1_000]);
  assert.equal(changes, 0, "a paused tick says nothing changed");
  off();
  playback.setSpeed(1);
  scheduler.advance(100);
  assert.equal(playback.positionMs(), 1_300, "the pause is not played afterwards");
  scheduler.advance(100);
  assert.deepEqual(said(), [-1, 1_000, 1_400]);
});

test("a long pause of the wall clock plays at most five seconds of wall time; a wall clock going back plays nothing", () => {
  let wall = 0;
  let tick: () => void = () => assert.fail("no interval");
  const scheduler = {
    now: () => wall,
    setInterval: (fn: () => void) => ((tick = fn), 1),
    clearInterval: () => {},
  };
  const { timeline } = timelineOf([]);
  const player = createPlayer(timeline, { scheduler, epochMs: EPOCH, speed: 1 });
  let changes = 0;
  player.playback.onChange(() => (changes += 1));
  player.start(() => {});
  wall = 60_000;
  tick();
  assert.equal(player.playback.positionMs(), 5_000);
  assert.equal(changes, 1);
  wall = 59_000;
  tick();
  assert.equal(player.playback.positionMs(), 5_000);
  assert.equal(changes, 1, "nothing played, nothing changed");
  wall = 60_000;
  tick();
  assert.equal(player.playback.positionMs(), 6_000, "the wall clock counts from where it went back to");
});

test("the loop end: a line due at or before it plays, then the next loop is rebuilt and its snapshot sent, the rest of the step carried over", () => {
  const { scheduler, calls, player, playback, heard, said } = play([9_950, DURATION], { speed: 16, startAt: 9_000 });
  player.start((m) => heard.push(m));
  calls.length = 0;
  scheduler.advance(100); // to 10_600: past the end by 600
  assert.deepEqual(calls, [
    `line 9950 base ${EPOCH}`,
    `line 10000 base ${EPOCH}`,
    "beforeLoop",
    `rebuild 0 loop 1 base ${EPOCH + DURATION}`,
    "snapshot",
  ]);
  assert.deepEqual(said(), [-1, 9_950, DURATION, -1]);
  assert.equal(playback.loop(), 1);
  assert.equal(playback.positionMs(), 600);
  assert.equal(player.now(), EPOCH + DURATION + 600);
});

test("one wall step over several loops plays each loop's lines in turn; beforeLoop may be left out", () => {
  const { timeline, calls } = timelineOf([100]);
  delete timeline.beforeLoop;
  let wall = 0;
  let tick: () => void = () => assert.fail("no interval");
  const scheduler = { now: () => wall, setInterval: (fn: () => void) => ((tick = fn), 1), clearInterval: () => {} };
  const player = createPlayer(timeline, { scheduler, epochMs: EPOCH, speed: 16, startAt: 9_990 });
  player.start(() => {});
  calls.length = 0;
  wall = 5_000; // 80 s of demo time from 9_990, the loop is 10 s
  tick();
  assert.equal(player.playback.loop(), 8);
  assert.equal(player.playback.positionMs(), 9_990);
  assert.equal(player.now(), EPOCH + 8 * DURATION + 9_990);
  assert.equal(calls.length, 3 * 8);
  assert.deepEqual(calls.slice(0, 3), [`rebuild 0 loop 1 base ${EPOCH + DURATION}`, "snapshot", `line 100 base ${EPOCH + DURATION}`]);
  assert.deepEqual(calls.slice(-3), [`rebuild 0 loop 8 base ${EPOCH + 8 * DURATION}`, "snapshot", `line 100 base ${EPOCH + 8 * DURATION}`]);
});

test("the clock moves with each line: a listener reading it while a line is sent hears that line's time", () => {
  const { scheduler, player, playback } = play([1_000, 1_100], { speed: 16 });
  const read: number[][] = [];
  player.start((m) => {
    if (m.type === "heartbeat" && m.seq > 0) read.push([m.seq, playback.positionMs(), player.now()]);
  });
  scheduler.advance(100);
  assert.deepEqual(read, [
    [1_000, 1_000, EPOCH + 1_000],
    [1_100, 1_100, EPOCH + 1_100],
  ]);
  assert.equal(playback.positionMs(), 1_600);
});

test("a seek: clamped to the loop (whole ms, anything not finite is the start), rebuilt, one snapshot if anyone listens, always a change", () => {
  const { calls, player, playback, heard, said } = play([]);
  let changes = 0;
  playback.onChange(() => (changes += 1));
  for (const [to, at] of [
    [2_000.6, 2_001],
    [-5, 0],
    [DURATION, DURATION - 1],
    [1e15, DURATION - 1],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [Number.NEGATIVE_INFINITY, 0],
  ] as const) {
    calls.length = 0;
    playback.seek(to);
    assert.deepEqual(calls, [`rebuild ${at} loop 0 base ${EPOCH}`], `seek ${to}`);
    assert.equal(playback.positionMs(), at, `seek ${to}`);
  }
  assert.equal(changes, 7);
  assert.deepEqual(said(), [], "nobody listens, no snapshot");
  const stop = player.start((m) => heard.push(m));
  playback.seek(300);
  assert.deepEqual(said(), [-1, -1]);
  stop();
  playback.seek(400);
  assert.deepEqual(said(), [-1, -1], "the listener left");
});

test("a seek and a speed restart the wall step: the time before them is not played after them, nor at the new speed", () => {
  const { scheduler, player, playback } = play([]);
  player.start(() => {});
  scheduler.advance(50);
  playback.seek(1_000);
  scheduler.advance(50); // the first tick, 50 ms after the seek
  assert.equal(playback.positionMs(), 1_050);
  scheduler.advance(50);
  playback.setSpeed(4);
  scheduler.advance(50); // the next tick, 50 ms after the speed
  assert.equal(playback.positionMs(), 1_250);
});

test("setSpeed: the speeds it accepts when the source names them, every speed when it does not", () => {
  const strict = play([], { speeds: [0, 1, 4, 16] });
  let changes = 0;
  strict.playback.onChange(() => (changes += 1));
  assert.throws(() => strict.playback.setSpeed(2 as 1), /Unsupported speed 2/);
  assert.equal(strict.playback.speed(), 1);
  assert.equal(changes, 0);
  strict.playback.setSpeed(4);
  assert.equal(strict.playback.speed(), 4);
  assert.equal(changes, 1);
  const free = play([]);
  free.playback.setSpeed(2 as 1);
  assert.equal(free.playback.speed(), 2);
});

test("start: the snapshot to the new listener alone; one interval while anyone listens; stopped with the last one", () => {
  const { scheduler, player, playback } = play([300], { speed: 1 });
  const one: SourceMessage[] = [];
  const two: SourceMessage[] = [];
  const stopOne = player.start((m) => one.push(m));
  assert.equal(one.length, 1);
  const stopTwo = player.start((m) => two.push(m));
  assert.equal(one.length, 1, "the first listener hears no second snapshot");
  assert.equal(two.length, 1);
  scheduler.advance(100);
  assert.equal(playback.positionMs(), 100, "one interval, not two");
  stopOne();
  scheduler.advance(200);
  assert.equal(playback.positionMs(), 300, "a listener left, the other keeps the clock going");
  assert.equal(two.length, 2, "and hears the line");
  assert.equal(one.length, 1);
  stopTwo();
  scheduler.advance(1_000);
  assert.equal(playback.positionMs(), 300, "nobody listens: the clock stands");
  player.start(() => {});
  scheduler.advance(100);
  assert.equal(playback.positionMs(), 400, "started again: the time nobody listened is not played");
});

test("send and changed reach every listener; a listener that leaves while a message is sent does not stop the round", () => {
  const { player, playback } = play([]);
  const heard: string[] = [];
  const stops: (() => void)[] = [];
  stops.push(player.start((m) => m.type === "team" && (heard.push("a"), stops[1]?.())));
  stops.push(player.start((m) => m.type === "team" && heard.push("b")));
  player.send({ type: "team", team: { v: 1, ts: "", sessions: [] } });
  assert.deepEqual(heard, ["a", "b"]);
  let changes = 0;
  const off = playback.onChange(() => (changes += 1));
  player.changed();
  assert.equal(changes, 1);
  off();
  player.changed();
  assert.equal(changes, 1, "unsubscribed");
});
