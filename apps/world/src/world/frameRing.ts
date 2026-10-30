/* Frame samples in a fixed ring (the fps overlay and the stress overlay): the frame loop pushes one sample per drawn
   frame and allocates nothing; statistics are read a few times a second. Pure: no Three.js, no DOM. */

/** Statistics over a window of drawn frames, in ms (fps per second). */
export interface FrameWindow {
  /** Drawn frames in the window. */
  frames: number;
  /** Drawn frames in the last second. */
  fps: number;
  /** No frame drawn for `IDLE_MS`: the loop rests (it draws on demand), so there is no frame rate to show. */
  idle: boolean;
  /** Time between drawn frames (a frame after an idle rest has none). */
  frameMean: number;
  frameP95: number;
  frameMax: number;
  /** Frames more than 33 ms after the one before. */
  slow: number;
  /** CPU work per frame (update and render submission). */
  workMean: number;
  workP95: number;
  /** The walk engine's tick. */
  tickMean: number;
  tickMax: number;
}

export const IDLE_MS = 250;
const SLOW_MS = 1000 / 30;

export class FrameRing {
  readonly capacity: number;
  #at: Float64Array;
  #interval: Float32Array;
  #work: Float32Array;
  #tick: Float32Array;
  #scratch: Float32Array;
  #head = 0;
  #count = 0;

  constructor(capacity = 1024) {
    this.capacity = capacity;
    this.#at = new Float64Array(capacity);
    this.#interval = new Float32Array(capacity);
    this.#work = new Float32Array(capacity);
    this.#tick = new Float32Array(capacity);
    this.#scratch = new Float32Array(capacity);
  }

  /** One drawn frame at `at` (ms); `interval` is NaN for the first frame after a rest. */
  push(at: number, interval: number, work: number, tick = 0) {
    const i = this.#head;
    this.#at[i] = at;
    this.#interval[i] = interval;
    this.#work[i] = work;
    this.#tick[i] = tick;
    this.#head = (i + 1) % this.capacity;
    this.#count = Math.min(this.capacity, this.#count + 1);
  }

  clear() {
    this.#head = 0;
    this.#count = 0;
  }

  /** The frames drawn since `now - windowMs`, at most the last `maxFrames` of them. */
  stats(now: number, windowMs: number, maxFrames = this.capacity): FrameWindow {
    const from = now - windowMs,
      second = now - 1000;
    let n = 0,
      fps = 0,
      last = -Infinity;
    // Newest first: the window is the run of samples back from the head.
    for (let k = 0; k < Math.min(this.#count, maxFrames); k++) {
      const i = (this.#head - 1 - k + this.capacity) % this.capacity;
      const at = this.#at[i]!;
      if (at < from) break;
      if (k === 0) last = at;
      if (at > second) fps++;
      n++;
    }
    const interval = this.#series(this.#interval, n),
      work = this.#series(this.#work, n),
      tick = this.#series(this.#tick, n);
    let slow = 0;
    for (let k = 0; k < n; k++) if (this.#interval[(this.#head - 1 - k + this.capacity) % this.capacity]! > SLOW_MS) slow++;
    return {
      frames: n,
      fps,
      idle: now - last > IDLE_MS,
      frameMean: interval.mean,
      frameP95: interval.p95,
      frameMax: interval.max,
      slow,
      workMean: work.mean,
      workP95: work.p95,
      tickMean: tick.mean,
      tickMax: tick.max,
    };
  }

  /** Mean, p95 and max of the newest `n` values of a series, skipping NaN; zeros when there are none. */
  #series(values: Float32Array, n: number) {
    let m = 0,
      sum = 0;
    for (let k = 0; k < n; k++) {
      const v = values[(this.#head - 1 - k + this.capacity) % this.capacity]!;
      if (Number.isNaN(v)) continue;
      this.#scratch[m++] = v;
      sum += v;
    }
    if (!m) return { mean: 0, p95: 0, max: 0 };
    const sorted = this.#scratch.subarray(0, m).sort();
    return { mean: sum / m, p95: sorted[Math.min(m - 1, Math.floor(m * 0.95))]!, max: sorted[m - 1]! };
  }
}
