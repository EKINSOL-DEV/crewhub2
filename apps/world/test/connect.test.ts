import assert from "node:assert/strict";
import test from "node:test";
import type { HostConnection, HostHealth } from "@crewhub/loops-client";
import { connectOutcome, connectScreen, keyTail, liveScreen, looksLikeKey, loopsVersion, normaliseKey, relativeTime, untilTime, withStreamKey } from "../src/state/connect.ts";

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

test("screen: once the town runs, an unpaired source sends the person back to the Pair screen; the host's key state decides between the Connect screen and the rejected screen; the rest is the chip's story", () => {
  const health = (key: "none" | "checking" | "rejected" | "ok" | "unchecked") => ({ connection: { discovery: { state: "found" as const }, key: { state: key }, stream: { state: "idle" as const, reconnects: 0 } } });
  assert.equal(liveScreen("unpaired"), "pair");
  assert.equal(liveScreen("unpaired", health("none")), "pair");
  // The key revoked while Live: loops refused it, the host marked it rejected.
  assert.equal(liveScreen("unauthorized", health("rejected")), "rejected", "the key revoked while Live");
  assert.equal(liveScreen("unauthorized"), "rejected", "a host from before the smooth connection: unauthorized is rejected");
  assert.equal(liveScreen("unauthorized", {}), "rejected", "an older host's health");
  // Forget this key in another tab: the host says "unauthorized" to the streams it holds (its legacy word for no key) and
  // 503 no_key to a stream that reconnects (loops down to the source); the key is none, so the Connect screen, never rejected.
  assert.equal(liveScreen("unauthorized", health("none")), "connect", "forgotten elsewhere, the stream's word");
  assert.equal(liveScreen("loops-down", health("none")), "connect", "forgotten elsewhere, the reconnected stream's 503");
  assert.equal(liveScreen("unauthorized", health("checking")), "checking", "a key pasted elsewhere is being checked");
  assert.equal(liveScreen("loops-down", health("checking")), "checking");
  // A health from before the change still says ok: no screen yet (the chip says it) until the next read.
  assert.equal(liveScreen("unauthorized", health("ok")), null);
  assert.equal(liveScreen("unauthorized", health("unchecked")), null);
  // Loops down with a key that stands: the chip's story over the last known town (round 7's ops road).
  assert.equal(liveScreen("loops-down", health("ok")), null);
  assert.equal(liveScreen("loops-down"), null);
  for (const state of ["connecting", "live", "catching-up", "stale", "stream-busy"] as const) {
    assert.equal(liveScreen(state), null, state);
    assert.equal(liveScreen(state, health("none")), null, `${state} with a health that lags`);
  }
  assert.equal(liveScreen(null), null);
});

test("screen: the stream's word on the key is preferred over the health read; a host that does not say leaves the read", () => {
  const read = health({ connection: connection({ key: { state: "ok", name: "crewhub-world", source: "stored" } }) });
  // After a Forget in another tab the stream says none before any health read does: the Connect screen at once.
  const forgotten = withStreamKey(read, "none");
  assert.equal(forgotten?.connection?.key.state, "none");
  assert.equal(forgotten?.connection?.key.name, "crewhub-world", "the rest of the read stays");
  assert.equal(liveScreen("unauthorized", forgotten), "connect");
  assert.equal(liveScreen("unauthorized", withStreamKey(read, "rejected")), "rejected", "the key revoked while Live");
  assert.equal(liveScreen("unauthorized", withStreamKey(read, "checking")), "checking");
  // A host from before round 11 says nothing: the health read decides as before.
  assert.equal(withStreamKey(read, null), read);
  assert.equal(withStreamKey(read, "ok"), read, "the same word: the same object");
  assert.equal(withStreamKey(null, "none"), null, "nothing known stays nothing");
  // An older host's read has no connection; the stream's word still gives the screens a key to go on.
  const older: HostHealth = { loops: "unauthorized", keyName: "", sharedKey: false, pairing: "on", paired: true };
  assert.equal(liveScreen("unauthorized", withStreamKey(older, "none")), "connect");
  assert.equal(liveScreen("unauthorized", older), "rejected");
});

test("untilTime: when the host re-checks a rejected key, in words", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const at = (s: number) => new Date(now + s * 1000).toISOString();
  assert.equal(untilTime(undefined, now), null);
  assert.equal(untilTime("soon", now), null);
  assert.equal(untilTime(at(-5), now), "now");
  assert.equal(untilTime(at(0), now), "now");
  assert.equal(untilTime(at(40), now), "in 40 s");
  assert.equal(untilTime(at(299), now), "in 5 min");
  assert.equal(untilTime(at(7200), now), "in 2 h");
});

test("loops' version: the host's loopsCommit, and the version it saw first when loops was updated under it", () => {
  assert.equal(loopsVersion(null), null);
  assert.equal(loopsVersion(health()), null, "a host from before says no version");
  assert.deepEqual(loopsVersion(health({ loopsCommit: "0.1.0" })), { version: "0.1.0", before: null });
  assert.deepEqual(loopsVersion(health({ loopsCommit: "0.1.0", loopsCommitBefore: "0.1.0" })), { version: "0.1.0", before: null }, "the same version is no update");
  assert.deepEqual(loopsVersion(health({ loopsCommit: "0.2.0", loopsCommitBefore: "0.1.0" })), { version: "0.2.0", before: "0.1.0" });
  assert.equal(loopsVersion(health({ loopsCommitBefore: "0.1.0" })), null, "no current version, nothing to say");
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

test("screen: the key's state and the stream's state decide, never the legacy loops word, and never mixed", () => {
  // Loops down (a timeout, a refused connection, a 5xx, a restart): never the rejected screen, whatever the key knows.
  assert.equal(connectScreen({ source: "live", health: health({ loops: "down", connection: connection({ key: { state: "unchecked" }, stream: { state: "down" } }) }) }), "loops-down", "a key loops has not answered about");
  assert.equal(connectScreen({ source: "live", health: health({ loops: "down", connection: connection({ key: { state: "unchecked" }, stream: { state: "idle" } }) }) }), "loops-down", "the key held, no stream yet");
  assert.equal(connectScreen({ source: "live", health: health({ loops: "down", connection: connection({ key: { state: "ok" }, stream: { state: "idle" } }) }) }), "loops-down");
  assert.equal(connectScreen({ source: "live", health: health({ loops: "unauthorized", connection: connection({ key: { state: "ok" }, stream: { state: "down" } }) }) }), "loops-down", "a stale legacy word never makes a rejected screen");
  // Loops refused the key: the rejected screen, whatever the legacy word says, and however the stream stands.
  assert.equal(connectScreen({ source: "live", health: health({ loops: "down", connection: connection({ key: { state: "rejected", reason: "revoked", source: "stored" }, stream: { state: "idle" } }) }) }), "rejected", "a kept rejected key");
  assert.equal(connectScreen({ source: "live", health: health({ loops: "ok", connection: connection({ key: { state: "rejected", reason: "revoked" }, stream: { state: "ok" } }) }) }), "rejected");
  assert.equal(connectScreen({ source: "live", health: health({ loops: "down", connection: connection({ key: { state: "ok" }, stream: { state: "unauthorized" } }) }) }), "rejected", "a stream loops refuses is a verdict on the key");
  // The town: a good (or not yet checked) key with a stream that runs, or one only the budget holds back.
  assert.equal(connectScreen({ source: "live", health: health({ loops: "down", connection: connection({ key: { state: "ok" }, stream: { state: "busy", reason: "stream budget exhausted (429)" } }) }) }), null, "busy: the town and the chip say so");
  assert.equal(connectScreen({ source: "live", health: health({ loops: "ok", connection: connection({ key: { state: "unchecked" }, stream: { state: "ok" } }) }) }), null);
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
