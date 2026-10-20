/** The `connection` object of the host's health (spec addendum "a smooth connection"): read strictly, never the key. */
import assert from "node:assert/strict";
import test from "node:test";
import { readConnection } from "../src/hostSource.ts";

test("readConnection keeps the states and the optional details, and drops what it does not know", () => {
  const full = readConnection({
    discovery: { state: "found", via: "app-socket", target: "/data/run/api.sock" },
    key: { state: "ok", name: "crewhub-world", source: "stored", extra: "chl_never" },
    stream: { state: "ok", cursor: 257, lastEventAt: "2026-10-21T01:00:00.000Z", reconnects: 2 },
  });
  assert.deepEqual(full, {
    discovery: { state: "found", via: "app-socket", target: "/data/run/api.sock" },
    key: { state: "ok", name: "crewhub-world", source: "stored" },
    stream: { state: "ok", cursor: 257, lastEventAt: "2026-10-21T01:00:00.000Z", reconnects: 2 },
  });
  assert.ok(!JSON.stringify(full).includes("chl_"), "an unknown field never passes (it could be a secret)");
});

test("readConnection answers the states only for an unpaired browser, and null for an older host", () => {
  assert.deepEqual(readConnection({ discovery: { state: "searching" }, key: { state: "none" }, stream: { state: "idle" } }), {
    discovery: { state: "searching" },
    key: { state: "none" },
    stream: { state: "idle", reconnects: 0 },
  });
  assert.deepEqual(
    readConnection({ discovery: { state: "found", via: "app-port" }, key: { state: "ok" }, stream: { state: "busy", reason: "stream budget exhausted (429): another host or tab uses this key", reconnects: 3 } }),
    { discovery: { state: "found", via: "app-port" }, key: { state: "ok" }, stream: { state: "busy", reason: "stream budget exhausted (429): another host or tab uses this key", reconnects: 3 } },
    "a 429 from loops is its own state, with the reason",
  );
  assert.equal(readConnection(undefined), null);
  assert.equal(readConnection({ discovery: { state: "lost" }, key: { state: "ok" }, stream: { state: "ok" } }), null);
  assert.deepEqual(readConnection({ discovery: { state: "found", via: "carrier-pigeon" }, key: { state: "rejected", reason: "A probe key reads nothing" }, stream: { state: "unauthorized", reconnects: 1 } }), {
    discovery: { state: "found" },
    key: { state: "rejected", reason: "A probe key reads nothing" },
    stream: { state: "unauthorized", reconnects: 1 },
  });
});
