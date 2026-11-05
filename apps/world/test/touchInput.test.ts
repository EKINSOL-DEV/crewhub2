/* The page's input kind (state/media.ts, round 65 w4-2): `touchInput()` is the coarse-pointer query's answer, read once,
   and false outside a browser or without `matchMedia`; `useTouchInput()` is the same query kept current (round 68,
   mx2: nothing in the tests called either, so every mutant of media.ts:40-44 survived). React's dispatcher is swapped
   for a recorder as renderTidy.test.ts does; the page's lists are cached per query, so the fake's `matches` is a getter. */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { TOUCH_INPUT, touchInput, useTouchInput } from "../src/state/media.ts";

const state = { coarse: false };
const made: string[] = [];
const fakeWindow = () => {
  (globalThis as { window?: unknown }).window = {
    matchMedia: (query: string) => {
      made.push(query);
      return {
        get matches() {
          return query === "(pointer: coarse)" ? state.coarse : query === "(pointer: fine)" ? !state.coarse : false;
        },
        addEventListener() {},
        removeEventListener() {},
      };
    },
  };
};

test("w4-2 (round 68, mx2: media.ts:40,44): the input is touch when the coarse-pointer query matches; false outside a browser or without matchMedia", () => {
  assert.equal(TOUCH_INPUT, "(pointer: coarse)");
  delete (globalThis as { window?: unknown }).window;
  assert.equal(touchInput(), false, "no window: false, no throw");
  (globalThis as { window?: unknown }).window = {};
  assert.equal(touchInput(), false, "a window without matchMedia: false, no throw");
  fakeWindow();
  state.coarse = true;
  assert.equal(touchInput(), true, "a coarse pointer is touch");
  assert.deepEqual(made, ["(pointer: coarse)"], "the coarse query asked, once");
  state.coarse = false;
  assert.equal(touchInput(), false, "a fine pointer is not");
  assert.deepEqual(made, ["(pointer: coarse)"], "the list is cached: not asked again");
});

test("w4-2 (round 68, mx2: media.ts:42): useTouchInput reads the same query through the media store", () => {
  fakeWindow();
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown } }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const before = internals.H;
  internals.H = { useSyncExternalStore: (_subscribe: unknown, read: () => boolean) => read() };
  try {
    state.coarse = true;
    assert.equal(useTouchInput(), true, "a coarse pointer");
    state.coarse = false;
    assert.equal(useTouchInput(), false, "a fine pointer");
  } finally {
    internals.H = before;
  }
  assert.ok(made.every((q) => q === "(pointer: coarse)"), `only the coarse query was asked: ${made.join(", ")}`);
});
