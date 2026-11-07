/* Round 32: the window keydown listener is added once and calls the latest handler. The hook (state/windowKeys.ts) is
   run through React's current dispatcher swapped for a small recorder, the way round 30 pinned the media hooks: refs
   persist across renders, a layout effect runs on every commit, an effect runs when its dependencies changed (never
   again for `[]`). Over a window that counts its listeners: three renders with three handlers give one add, a key
   pressed after the third render reaches the third handler, and the unmount removes the one listener. */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { useWindowKeydown } from "../src/state/windowKeys.ts";

type Cleanup = (() => void) | void;
type Effect = { deps: unknown[] | undefined; cleanup: Cleanup };

/** A dispatcher for one component: `render(fn)` runs fn as a render and then its commit (layout effects, then effects). */
const harness = () => {
  const refs: { current: unknown }[] = [];
  const effects: Effect[] = [];
  let refAt = 0;
  let effectAt = 0;
  const layout: (() => Cleanup)[] = [];
  const passive: { at: number; fn: () => Cleanup; deps: unknown[] | undefined }[] = [];
  const sameDeps = (a: unknown[] | undefined, b: unknown[] | undefined) => a !== undefined && b !== undefined && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const dispatcher = {
    useRef<T>(initial: T) {
      const at = refAt++;
      if (refs[at] === undefined) refs[at] = { current: initial };
      return refs[at] as { current: T };
    },
    useLayoutEffect(fn: () => Cleanup) {
      layout.push(fn);
    },
    useEffect(fn: () => Cleanup, deps?: unknown[]) {
      passive.push({ at: effectAt++, fn, deps });
    },
  };
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown } }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  return {
    render(fn: () => void) {
      const before = internals.H;
      internals.H = dispatcher;
      refAt = 0;
      effectAt = 0;
      layout.length = 0;
      passive.length = 0;
      try {
        fn();
      } finally {
        internals.H = before;
      }
      for (const run of layout) run();
      for (const { at, fn: run, deps } of passive) {
        const known = effects[at];
        if (known && sameDeps(known.deps, deps)) continue;
        if (known?.cleanup) known.cleanup();
        effects[at] = { deps, cleanup: run() };
      }
    },
    unmount() {
      for (const effect of effects) if (effect?.cleanup) effect.cleanup();
      effects.length = 0;
    },
  };
};

test("useWindowKeydown: one listener over three renders, the latest handler called, removed on unmount", () => {
  const listeners = new Set<(e: KeyboardEvent) => void>();
  let adds = 0;
  let removes = 0;
  (globalThis as { window?: unknown }).window = {
    addEventListener(type: string, listener: (e: KeyboardEvent) => void) {
      assert.equal(type, "keydown");
      adds += 1;
      listeners.add(listener);
    },
    removeEventListener(type: string, listener: (e: KeyboardEvent) => void) {
      assert.equal(type, "keydown");
      removes += 1;
      listeners.delete(listener);
    },
  };
  const h = harness();
  const seen: string[] = [];
  const handler = (name: string) => (e: KeyboardEvent) => seen.push(`${name}:${e.key}`);
  h.render(() => useWindowKeydown(handler("first")));
  h.render(() => useWindowKeydown(handler("second")));
  h.render(() => useWindowKeydown(handler("third")));
  assert.equal(adds, 1, "added once");
  assert.equal(removes, 0, "never re-added");
  assert.equal(listeners.size, 1);
  for (const listener of listeners) listener({ key: "Escape" } as KeyboardEvent);
  assert.deepEqual(seen, ["third:Escape"], "the latest render's handler, not an earlier one");
  h.render(() => useWindowKeydown(handler("fourth")));
  for (const listener of listeners) listener({ key: "t" } as KeyboardEvent);
  assert.deepEqual(seen, ["third:Escape", "fourth:t"]);
  assert.equal(adds, 1);
  h.unmount();
  assert.equal(removes, 1, "the one listener removed");
  assert.equal(listeners.size, 0);
});
