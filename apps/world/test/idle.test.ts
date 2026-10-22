/* Round 22: the browser chrome's theme colour (state/theme.tsx, `syncThemeColor`: a computed style and a 2D canvas)
   is written in the browser's idle time, not in a frame callback on the road to the first frame. `whenIdle` is the
   seam: an idle callback with a deadline where the browser has one, a timer where it has not, and a cancel either way. */
import assert from "node:assert/strict";
import test from "node:test";
import { whenIdle } from "../src/state/idle.ts";

const g = globalThis as unknown as { requestIdleCallback?: unknown; cancelIdleCallback?: unknown };

test("with requestIdleCallback: the task is asked for idle time with a 2 s deadline; the cancel cancels that request", () => {
  const asked: { timeout?: number }[] = [];
  const cancelled: number[] = [];
  let callback: (() => void) | null = null;
  g.requestIdleCallback = (cb: () => void, options: { timeout?: number }) => {
    asked.push(options);
    callback = cb;
    return 7;
  };
  g.cancelIdleCallback = (id: number) => cancelled.push(id);
  try {
    let ran = 0;
    const cancel = whenIdle(() => ran++);
    assert.deepEqual(asked, [{ timeout: 2000 }]);
    assert.equal(ran, 0);
    callback!();
    assert.equal(ran, 1);
    cancel();
    assert.deepEqual(cancelled, [7]);
    whenIdle(() => undefined, 500);
    assert.equal(asked[1]?.timeout, 500);
  } finally {
    delete g.requestIdleCallback;
    delete g.cancelIdleCallback;
  }
});

test("without requestIdleCallback: a timer runs the task after the deadline, and the cancel clears it", async () => {
  assert.equal(typeof g.requestIdleCallback, "undefined");
  let ran = 0;
  whenIdle(() => ran++, 10);
  const cancel = whenIdle(() => ran += 100, 10);
  cancel();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(ran, 1);
});
