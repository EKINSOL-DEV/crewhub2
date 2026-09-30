import assert from "node:assert/strict";
import test from "node:test";
import { parseRoleOverrides, readRoleOverrides, ROLE_OVERRIDES_KEY, writeRoleOverrides } from "../src/state/roleOverrides.ts";

test("role overrides keep only known roles and survive storage that throws", () => {
  assert.deepEqual(parseRoleOverrides('{"cr-scout":"design","x":"boss","":"lead"}'), { "cr-scout": "design" });
  assert.deepEqual(parseRoleOverrides("not json"), {});
  assert.deepEqual(parseRoleOverrides("[1]"), {});
  const throwing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(readRoleOverrides(throwing), {});
  assert.doesNotThrow(() => writeRoleOverrides({ a: "lead" }, throwing));
  const store = new Map<string, string>();
  const memory = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  writeRoleOverrides({ "cl-dev-1": "analyst" }, memory);
  assert.equal(store.has(ROLE_OVERRIDES_KEY), true);
  assert.deepEqual(readRoleOverrides(memory), { "cl-dev-1": "analyst" });
});
