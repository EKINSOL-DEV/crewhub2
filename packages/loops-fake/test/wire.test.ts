/**
 * Loops' wire grammar as `wire.ts` writes it once for the fake and the host's test stub (round 61, W3): the error
 * envelope, where a read or a stream resumes, the heartbeat line, the 429 answer.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { RETRY_AFTER_S, WireError, errorBody, heartbeatLine, ndjsonLine, parseResume, tooManyStreams } from "../src/wire.ts";

test("the error envelope: code, message, detail null; a WireError carries its status, headers and that body", () => {
  assert.deepEqual(errorBody("not_found", "Not found"), { error: { code: "not_found", message: "Not found", detail: null } });
  const e = new WireError(410, "cursor_expired", "The cursor cannot be used");
  assert.ok(e instanceof Error);
  assert.deepEqual({ status: e.status, code: e.code, message: e.message, headers: e.headers, body: e.body }, { status: 410, code: "cursor_expired", message: "The cursor cannot be used", headers: {}, body: errorBody("cursor_expired", "The cursor cannot be used") });
});

/** The WireError a call throws. */
function refused(fn: () => unknown, label?: string): WireError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof WireError, label);
    return error;
  }
  assert.fail(`${label ?? "the call"} did not throw`);
}

test("resume: after= or cursor=, never both; an after is a non-negative safe integer; else the Last-Event-ID header, an integer as after and anything else as a cursor; the after query wins", () => {
  const q = (s: string) => new URLSearchParams(s);
  assert.deepEqual(parseResume(q("")), { after: null, cursor: null }, "neither: the caller's default");
  assert.deepEqual(parseResume(q("after=12")), { after: 12, cursor: null });
  assert.deepEqual(parseResume(q("after=0")), { after: 0, cursor: null });
  assert.deepEqual(parseResume(q("cursor=abc")), { after: null, cursor: "abc" });
  const both = refused(() => parseResume(q("after=1&cursor=abc")));
  assert.deepEqual({ status: both.status, code: both.code, message: both.message }, { status: 400, code: "validation_error", message: "Send either cursor or after, not both" });
  for (const bad of ["after=-1", "after=1.5", "after=x", "after=", `after=${Number.MAX_SAFE_INTEGER + 1}`]) {
    const e = refused(() => parseResume(q(bad)), bad);
    assert.deepEqual({ status: e.status, code: e.code, message: e.message }, { status: 400, code: "validation_error", message: "Invalid after" }, bad);
  }
  assert.deepEqual(parseResume(q(""), "7"), { after: 7, cursor: null }, "an integer header is after");
  assert.deepEqual(parseResume(q(""), " 7 "), { after: 7, cursor: null }, "trimmed");
  assert.deepEqual(parseResume(q(""), "s7w7xabc"), { after: null, cursor: "s7w7xabc" }, "anything else is a cursor to open");
  assert.deepEqual(parseResume(q(""), "99999999999999999999"), { after: null, cursor: "99999999999999999999" }, "an unsafe integer in the header is judged as a cursor, as the fake did");
  assert.deepEqual(parseResume(q("after=3"), "7"), { after: 3, cursor: null }, "the after query wins over the header (CL-403)");
  assert.deepEqual(parseResume(q("cursor=tok"), "7"), { after: null, cursor: "tok" }, "a cursor query wins too");
  assert.deepEqual(parseResume(q(""), ["5", "6"]), { after: 5, cursor: null }, "a repeated header: the first");
  assert.throws(() => parseResume(q("after=x"), "7"), WireError, "a bad after query is refused even with a header");
});

test("the heartbeat line: v, type, seq, the cursor of now (none for a loops before CL-406), ts last", () => {
  const now = new Date("2026-11-04T20:00:00.000Z");
  assert.deepEqual(Object.entries(heartbeatLine(41, "tok", now)), [["v", 1], ["type", "heartbeat"], ["seq", 41], ["cursor", "tok"], ["ts", "2026-11-04T20:00:00.000Z"]]);
  assert.deepEqual(Object.entries(heartbeatLine(41, null, now)), [["v", 1], ["type", "heartbeat"], ["seq", 41], ["ts", "2026-11-04T20:00:00.000Z"]]);
  assert.equal(ndjsonLine({ a: 1 }), '{"a":1}\n');
});

test("429 too_many_streams carries Retry-After: loops' 5 s, or a test's own value", () => {
  assert.equal(RETRY_AFTER_S, 5);
  const busy = tooManyStreams();
  assert.deepEqual({ status: busy.status, headers: busy.headers, body: busy.body }, { status: 429, headers: { "retry-after": "5" }, body: errorBody("too_many_streams", "Too many open event streams") });
  assert.deepEqual(tooManyStreams("1").headers, { "retry-after": "1" });
  assert.deepEqual(tooManyStreams(0).headers, { "retry-after": "0" });
});
