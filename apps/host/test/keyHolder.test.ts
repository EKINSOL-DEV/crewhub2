/**
 * The key's state machine (keyHolder.ts, round 61 H6): every transition of the table, on a record, with no stub, no
 * timer and no connection. The connection's rows in connection.test.ts prove the same words through the stub.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UNKNOWN_REASON } from "../src/keyCheck.ts";
import { type HeldKey, type KeyState, STREAM_REFUSED_REASON, checked, checking, holdKey, secondOpinion } from "../src/keyHolder.ts";

const OK = { state: "ok", name: "crewhub-world", displayName: "World" } as const;
const REJECTED = { state: "rejected", reason: UNKNOWN_REASON } as const;
const UNREACHABLE = { state: "unreachable", reason: "crewhub-loops did not answer (a timeout or a refused connection)" } as const;

/** A key in the given state, the way the connection gets it there. */
function keyIn(state: KeyState): HeldKey {
  const held = holdKey("chl_" + "k".repeat(20), "world-file", "stored", "unchecked");
  if (state === "unchecked") return held;
  checking(held);
  if (state === "checking") return held;
  checked(held, state === "ok" ? OK : REJECTED);
  return held;
}
const word = (held: HeldKey) => ({ state: held.state, reason: held.reason });

describe("the held key", () => {
  it("held: unchecked from a file, ok when pasted; the key, the name and the source as given, no reason", () => {
    assert.deepEqual(holdKey("chl_k", "world-file", "stored", "unchecked"), { key: "chl_k", name: "world-file", source: "stored", state: "unchecked" });
    assert.deepEqual(holdKey("chl_p", "crewhub-world", "env", "ok"), { key: "chl_p", name: "crewhub-world", source: "env", state: "ok" });
  });

  it("a check: checking from every state; ok takes the principal's name and drops the reason; rejected keeps the name and takes loops' reason", () => {
    for (const from of ["unchecked", "ok", "rejected", "checking"] as const) {
      const held = keyIn(from);
      checking(held);
      assert.equal(held.state, "checking", `from ${from}`);
      checked(held, OK);
      assert.deepEqual(word(held), { state: "ok", reason: undefined }, `ok from ${from}`);
      assert.equal(held.name, "crewhub-world", "the principal's name");
      const again = keyIn(from);
      const named = again.name;
      checking(again);
      checked(again, REJECTED);
      assert.deepEqual(word(again), { state: "rejected", reason: UNKNOWN_REASON }, `rejected from ${from}`);
      assert.equal(again.name, named, "the name as held");
    }
  });

  it("an unreachable loops is no verdict: the state before the check comes back (its reason kept), and a check that was already checking is unchecked", () => {
    const rows: { from: KeyState; back: KeyState; reason: string | undefined }[] = [
      { from: "unchecked", back: "unchecked", reason: undefined },
      { from: "ok", back: "ok", reason: undefined },
      { from: "rejected", back: "rejected", reason: UNKNOWN_REASON },
      { from: "checking", back: "unchecked", reason: undefined },
    ];
    for (const row of rows) {
      const held = keyIn(row.from);
      checking(held);
      checked(held, UNREACHABLE);
      assert.deepEqual(word(held), { state: row.back, reason: row.reason }, `from ${row.from}`);
    }
  });

  it("the stream's 401: rejected with the stream's reason from every other state, said once; a key rejected by the check keeps the check's reason", () => {
    for (const from of ["unchecked", "ok", "checking"] as const) {
      const held = keyIn(from);
      assert.equal(secondOpinion(held, "unauthorized"), true, `from ${from}`);
      assert.deepEqual(word(held), { state: "rejected", reason: STREAM_REFUSED_REASON });
      assert.equal(secondOpinion(held, "unauthorized"), false, "the second 401 changes nothing");
      assert.deepEqual(word(held), { state: "rejected", reason: STREAM_REFUSED_REASON });
    }
    const checked = keyIn("rejected");
    assert.equal(secondOpinion(checked, "unauthorized"), false);
    assert.equal(checked.reason, UNKNOWN_REASON, "the check's reason stands");
  });

  it("the stream open: ok from every other state with the reason dropped, said once", () => {
    for (const from of ["unchecked", "rejected", "checking"] as const) {
      const held = keyIn(from);
      assert.equal(secondOpinion(held, "ok"), true, `from ${from}`);
      assert.deepEqual(word(held), { state: "ok", reason: undefined });
      assert.equal(secondOpinion(held, "ok"), false, "the stream staying open changes nothing");
    }
    assert.equal(secondOpinion(keyIn("ok"), "ok"), false);
  });

  it("the record is the fields the connection reads and nothing else: what a check remembers is not in it", () => {
    assert.deepEqual(Object.keys(keyIn("checking")), ["key", "name", "source", "state"]);
    assert.deepEqual(Object.keys(keyIn("rejected")), ["key", "name", "source", "state", "reason"]);
  });
});
