import assert from "node:assert/strict";
import test from "node:test";
import { FPS_KEY, readFps, writeFps } from "../src/state/fps.ts";
import { FrameRing } from "../src/world/frameRing.ts";

test("the frame rate overlay is off by default, kept per viewer, and survives storage that throws", () => {
  const throwing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readFps(throwing), false);
  assert.doesNotThrow(() => writeFps(true, throwing));
  assert.equal(readFps(null), false);
  const store = new Map<string, string>();
  const memory = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(readFps(memory), false);
  writeFps(true, memory);
  assert.equal(store.get(FPS_KEY), "on");
  assert.equal(readFps(memory), true);
  writeFps(false, memory);
  assert.equal(readFps(memory), false);
});

test("the frame ring reports fps, mean, p95, max and slow frames over its window", () => {
  const ring = new FrameRing(64);
  const empty = ring.stats(1000, 2000);
  assert.deepEqual([empty.frames, empty.fps, empty.idle, empty.frameMean, empty.frameP95], [0, 0, true, 0, 0]);
  // 100 frames 20 ms apart, one of them 50 ms late; the ring keeps only the newest 64.
  let at = 0;
  for (let i = 0; i < 100; i++) {
    const interval = i === 90 ? 50 : 20;
    at += interval;
    ring.push(at, interval, 2 + (i % 10) / 10, 0.5);
  }
  const s = ring.stats(at, 2000);
  assert.equal(s.frames, 64);
  assert.equal(s.fps, 49); // frames in (at - 1000, at]: 49 intervals, one of them 50 ms
  assert.equal(s.idle, false);
  assert.equal(s.frameMax, 50);
  assert.equal(s.slow, 1);
  assert.equal(s.frameP95, 20);
  assert.ok(Math.abs(s.frameMean - (63 * 20 + 50) / 64) < 1e-9);
  assert.ok(Math.abs(s.workP95 - 2.9) < 1e-6);
  assert.equal(s.tickMax, 0.5);
  // A short window and a frame cap.
  assert.equal(ring.stats(at, 100).frames, 6); // both ends of the window count
  assert.equal(ring.stats(at, 2000, 10).frames, 10);
});

test("a frame after a rest has no interval, and a resting loop reads as idle", () => {
  const ring = new FrameRing(16);
  ring.push(0, NaN, 3);
  ring.push(16, 16, 3);
  ring.push(5000, NaN, 4); // drawn on demand after five quiet seconds
  const s = ring.stats(5000, 2000);
  assert.equal(s.frames, 1);
  assert.equal(s.frameMax, 0); // no interval to count, not a 4984 ms frame
  assert.equal(s.workMean, 4);
  assert.equal(ring.stats(5300, 2000).idle, true);
  assert.equal(ring.stats(5100, 2000).idle, false);
});
