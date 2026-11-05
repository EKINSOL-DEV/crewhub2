/* Choosing a scenario in the Demo chip's menu loads that scenario's page, and nothing was focused afterwards (round 65,
   walk finding w5-18): the chip remembers, for this tab, that the Demo chip should take the focus once the page is
   back (state/afterReload.ts, over sessionStorage). Taken once: a later plain reload focuses nothing, as before. The
   storage is asked for inside the `try`: with blocked site data reading `sessionStorage` itself throws, and that read on
   the App's mount would leave an empty page (seen in a browser before this was so). */
import assert from "node:assert/strict";
import test from "node:test";
import { rememberFocus, takeFocus } from "../src/state/afterReload.ts";

const storage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

test("remembered once, taken once: the Demo chip after the scenario's page loads, then nothing", () => {
  const s = storage();
  assert.equal(takeFocus(() => s), null, "nothing remembered: nothing to focus");
  rememberFocus(() => s, "demo-chip");
  assert.equal(s.map.size, 1, "one key in the tab's storage");
  assert.equal(takeFocus(() => s), "demo-chip");
  assert.equal(takeFocus(() => s), null, "taken once; a later reload focuses nothing");
  assert.equal(s.map.size, 0, "the key is gone");
});

test("a value this build does not know is nothing to focus, and is cleared", () => {
  const s = storage();
  s.setItem("crewhub-world:focus-after-reload", "something-else");
  assert.equal(takeFocus(() => s), null);
  assert.equal(s.map.size, 0);
});

test("a storage whose methods throw is nothing to remember and nothing to focus", () => {
  const throwing = { getItem: () => { throw new Error("no storage"); }, setItem: () => { throw new Error("no storage"); }, removeItem: () => { throw new Error("no storage"); } };
  assert.doesNotThrow(() => rememberFocus(() => throwing, "demo-chip"));
  assert.equal(takeFocus(() => throwing), null);
});

test("reading the storage itself may throw (blocked site data): neither call lets it out", () => {
  const blocked = (): never => {
    throw new DOMException("Access is denied", "SecurityError");
  };
  assert.doesNotThrow(() => rememberFocus(blocked, "demo-chip"));
  assert.doesNotThrow(() => takeFocus(blocked));
  assert.equal(takeFocus(blocked), null);
});
