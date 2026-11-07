/* `npm run loops:fake -- --port`: a port of its own, never the Mac app's nor the world host's default (src/ports.ts, round 36). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { FAKE_DEFAULT_PORT, FAKE_REFUSED_PORTS, fakePortVerdict } from "../src/ports.ts";

test("the default is 8391; a named port of its own passes, 0 (a free port) too", () => {
  assert.equal(FAKE_DEFAULT_PORT, 8391);
  assert.deepEqual(fakePortVerdict(undefined), { ok: true, port: 8391 });
  assert.deepEqual(fakePortVerdict("8393"), { ok: true, port: 8393 });
  assert.deepEqual(fakePortVerdict("0"), { ok: true, port: 0 });
  assert.deepEqual(fakePortVerdict(" 8392 "), { ok: true, port: 8392 });
});

test("the Mac app's ports and 5180 are refused with the reason; so is anything that is not a port", () => {
  assert.deepEqual(FAKE_REFUSED_PORTS, [8091, 8000, 9443, 5180]);
  for (const port of [8091, 8000, 9443]) {
    const verdict = fakePortVerdict(String(port));
    assert.equal(verdict.ok, false);
    assert.match(verdict.ok ? "" : verdict.reason, new RegExp(`--port ${port}: that is the Mac app's port`));
  }
  const host = fakePortVerdict("5180");
  assert.match(host.ok ? "" : host.reason, /world host's default port/);
  for (const bad of ["", "abc", "-1", "70000", "80.91"]) assert.match((fakePortVerdict(bad) as { reason: string }).reason, /must be a port number/, bad);
});
