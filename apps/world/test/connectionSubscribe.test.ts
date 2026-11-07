/* The connection hooks' subscribe function (state/runtimes.ts `useConnection`, `useConnectionKey`; round 50, r48-live N3):
   one function per connection, so `useSyncExternalStore` does not unsubscribe and subscribe again on every App render.
   Pure, no React. */
import assert from "node:assert/strict";
import test from "node:test";
import { subscribeOf } from "../src/state/connectionSubscribe.ts";

function fakeConnection() {
  const listeners = new Set<() => void>();
  return {
    listeners,
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

test("subscribeOf: the same function for the same connection, another for another, a no-op for none", () => {
  const one = fakeConnection();
  const other = fakeConnection();
  assert.equal(subscribeOf(one), subscribeOf(one), "stable across renders");
  assert.notEqual(subscribeOf(one), subscribeOf(other));
  assert.equal(subscribeOf(null), subscribeOf(null));
  const listener = () => {};
  const off = subscribeOf(one)(listener);
  assert.ok(one.listeners.has(listener), "it subscribes to the connection");
  off();
  assert.equal(one.listeners.size, 0, "and unsubscribes");
  assert.equal(typeof subscribeOf(null)(listener), "function");
});
