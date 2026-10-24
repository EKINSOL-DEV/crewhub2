import assert from "node:assert/strict";
import test from "node:test";
import { DETAILS_KEY, readDetails, writeDetails } from "../src/state/details.ts";

test("the details toggle is off by default, kept per viewer, and survives storage that throws", () => {
  const throwing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readDetails(throwing), false);
  assert.doesNotThrow(() => writeDetails(true, throwing));
  assert.equal(readDetails(null), false);
  const store = new Map<string, string>();
  const memory = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(readDetails(memory), false);
  writeDetails(true, memory);
  assert.equal(store.get(DETAILS_KEY), "on");
  assert.equal(readDetails(memory), true);
  writeDetails(false, memory);
  assert.equal(readDetails(memory), false);
});
