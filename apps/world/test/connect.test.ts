import assert from "node:assert/strict";
import test from "node:test";
import type { HostConnection, HostHealth } from "@crewhub/loops-client";
import { connectOutcome, connectScreen, keyTail, liveScreen, looksLikeKey, normaliseKey, relativeTime } from "../src/state/connect.ts";

const connection = (over: { discovery?: Partial<HostConnection["discovery"]>; key?: Partial<HostConnection["key"]>; stream?: Partial<HostConnection["stream"]> } = {}): HostConnection => ({
  discovery: { state: "found", via: "app-port", target: "http://127.0.0.1:8091", ...over.discovery },
  key: { state: "ok", name: "crewhub-world", source: "stored", ...over.key },
  stream: { state: "ok", cursor: 12, reconnects: 0, ...over.stream },
});
const health = (over: Partial<HostHealth> = {}): HostHealth => ({ loops: "ok", keyName: "crewhub-world", sharedKey: false, pairing: "on", paired: true, connection: connection(), ...over });

test("screen: the demo and a silent host show the world", () => {
  assert.equal(connectScreen({ source: "demo", health: health({ connection: connection({ discovery: { state: "searching" } }) }) }), null);
  assert.equal(connectScreen({ source: "live", health: null }), null);
});

test("screen: a host from before the smooth connection only knows pairing", () => {
  const old = health({ paired: false });
  delete old.connection;
  assert.equal(connectScreen({ source: "live", health: old }), "pair");
  assert.equal(connectScreen({ source: "live", health: { ...old, paired: true } }), null);
  assert.equal(connectScreen({ source: "live", health: { ...old, paired: true, loops: "down" } }), "loops-down", "never the empty clearing over a loops that is down");
  assert.equal(connectScreen({ source: "live", health: { ...old, paired: true, loops: "unauthorized" } }), "rejected");
  const beforePairing = health({ paired: false });
  delete beforePairing.connection;
  delete beforePairing.pairing;
  assert.equal(connectScreen({ source: "live", health: beforePairing }), null);
});

test("screen: once the town runs, only an unpaired source sends the person back, to the Pair screen", () => {
  assert.equal(liveScreen("unpaired"), "pair");
  for (const state of ["connecting", "live", "catching-up", "stale", "loops-down", "unauthorized", "stream-busy"] as const) assert.equal(liveScreen(state), null, state);
  assert.equal(liveScreen(null), null);
});

test("screen: no loops found comes first, even before pairing", () => {
  const searching = connection({ discovery: { state: "searching" }, key: { state: "none" }, stream: { state: "idle" } });
  assert.equal(connectScreen({ source: "live", health: health({ paired: false, connection: searching }) }), "no-loops");
  assert.equal(connectScreen({ source: "live", health: health({ connection: searching }) }), "no-loops");
});

test("screen: then pairing, then the key", () => {
  assert.equal(connectScreen({ source: "live", health: health({ paired: false, connection: connection({ key: { state: "none" } }) }) }), "pair");
  assert.equal(connectScreen({ source: "live", health: health({ connection: connection({ key: { state: "none" }, stream: { state: "idle" } }) }) }), "connect");
  assert.equal(connectScreen({ source: "live", health: health({ connection: connection({ key: { state: "checking" }, stream: { state: "idle" } }) }) }), "checking");
  assert.equal(connectScreen({ source: "live", health: health({ connection: connection({ key: { state: "rejected", reason: "a read-only key" }, stream: { state: "idle" } }) }) }), "rejected");
  assert.equal(connectScreen({ source: "live", health: health() }), null, "a good key: the town");
  assert.equal(connectScreen({ source: "live", health: health({ loops: "down", connection: connection({ stream: { state: "down" } }) }) }), "loops-down", "a good key but loops not answering: not the empty clearing");
  assert.equal(connectScreen({ source: "live", health: health({ loops: "unauthorized", connection: connection({ stream: { state: "unauthorized" } }) }) }), "rejected", "a key the stream refuses");
});

test("screen: pairing off in development never asks to pair", () => {
  assert.equal(connectScreen({ source: "live", health: health({ pairing: "off", paired: true, connection: connection({ key: { state: "none" } }) }) }), "connect");
});

test("key: pasted text is trimmed and stripped of quotes and a bearer prefix; a clean key is untouched", () => {
  const key = "chl_1234567890abcdefghijklmnopqrstuvwxyzABCDEFG";
  assert.equal(normaliseKey(key), key);
  assert.equal(normaliseKey(`  ${key}\n`), key);
  assert.equal(normaliseKey(`"${key}"`), key);
  assert.equal(normaliseKey(`'${key}'`), key);
  assert.equal(normaliseKey("`" + key + "`"), key);
  assert.equal(normaliseKey(`Authorization: Bearer ${key}`), key);
  assert.equal(normaliseKey(`Bearer ${key}`), key);
  assert.equal(normaliseKey(`chl_12\n34`), "chl_1234", "a key wrapped by a terminal is one key");
  assert.equal(normaliseKey(""), "");
});

test("key: only its last four characters are ever shown", () => {
  assert.equal(keyTail("chl_1234567890abcdefghijklmnopqrstuvwxyzABCDEFG"), "DEFG");
  assert.equal(keyTail("abc"), "abc");
  assert.equal(keyTail(""), "");
});

test("key: the shape loops makes (chl_ and 43 base64url characters) is a key; fragments are not", () => {
  assert.equal(looksLikeKey("chl_" + "a".repeat(43)), true);
  assert.equal(looksLikeKey("chl_" + "a-_Z9".repeat(9)), true);
  assert.equal(looksLikeKey("chl_"), false);
  assert.equal(looksLikeKey("chl_short"), false);
  assert.equal(looksLikeKey("abc_" + "a".repeat(43)), false);
  assert.equal(looksLikeKey("chl_" + "a".repeat(20) + " " + "b".repeat(22)), false);
});

test("connect outcome: the host's answer in words, never the key", () => {
  assert.deepEqual(connectOutcome(204, null), { kind: "ok" });
  assert.deepEqual(connectOutcome(200, { ok: true }), { kind: "ok" });
  assert.deepEqual(connectOutcome(401, { error: "not_paired" }), { kind: "not-paired" });
  assert.deepEqual(connectOutcome(401, { error: "rejected", reason: "crewhub-loops does not know this key" }), { kind: "rejected", reason: "crewhub-loops does not know this key" });
  assert.deepEqual(connectOutcome(403, { error: "rejected", message: "a read-only key cannot read the team" }), { kind: "rejected", reason: "a read-only key cannot read the team" });
  assert.deepEqual(connectOutcome(422, { error: "rejected" }), { kind: "rejected", reason: null });
  assert.deepEqual(connectOutcome(400, { error: "bad_request", message: "key missing" }), { kind: "failed", reason: "key missing" });
  assert.deepEqual(connectOutcome(502, { error: "loops_down" }), { kind: "failed", reason: "loops_down" });
  assert.deepEqual(connectOutcome(0, null), { kind: "failed", reason: null });
  assert.deepEqual(connectOutcome(405, null), { kind: "failed", reason: "405" }, "a host from before the connect route");
});

test("relative time: seconds, minutes, hours, days; never for nothing", () => {
  const now = Date.parse("2026-10-21T02:00:00Z");
  assert.equal(relativeTime(undefined, now), null);
  assert.equal(relativeTime("not a date", now), null);
  assert.equal(relativeTime("2026-10-21T01:59:58Z", now), "just now");
  assert.equal(relativeTime("2026-10-21T01:59:20Z", now), "40 s ago");
  assert.equal(relativeTime("2026-10-21T01:57:00Z", now), "3 min ago");
  assert.equal(relativeTime("2026-10-20T23:00:00Z", now), "3 h ago");
  assert.equal(relativeTime("2026-10-18T02:00:00Z", now), "3 d ago");
  assert.equal(relativeTime("2026-10-21T02:00:05Z", now), "just now", "a clock ahead of ours is now");
});
