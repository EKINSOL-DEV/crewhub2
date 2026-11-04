/* The fake's own port rule (packages/loops-fake/src/ports.ts, round 36) against the one named-port list
   (scripts/named-ports.mjs, round 57d): the package keeps its list package-local, so this test is what keeps it from
   drifting (round 58d). Every port the fake refuses must be a named port, said for the same reason; the fake's
   default is the named port that is a running loops-fake's. Pure: the lists and the verdict function, never a socket. */
import assert from "node:assert/strict";
import test from "node:test";
import { APP_PORTS, HOST_DEFAULT_PORT, NAMED_PORTS, namedPort } from "../named-ports.mjs";
import { FAKE_DEFAULT_PORT, FAKE_REFUSED_PORTS, fakePortVerdict } from "../../packages/loops-fake/src/ports.ts";

test("every port the fake refuses is a named port (the fake's list is a subset of scripts/named-ports.mjs)", () => {
  const named = new Set(NAMED_PORTS.map((entry) => entry.port));
  assert.deepEqual(FAKE_REFUSED_PORTS.filter((port) => !named.has(port)), [], "a refused port that is not on the named list");
  assert.equal(new Set(FAKE_REFUSED_PORTS).size, FAKE_REFUSED_PORTS.length, "no port twice");
});

test("each refused port is refused for the reason the named list gives it: the Mac app's or the world host's default", () => {
  for (const port of FAKE_REFUSED_PORTS) {
    const verdict = fakePortVerdict(String(port));
    assert.equal(verdict.ok, false, `${port} refused`);
    const reason = verdict.ok ? "" : verdict.reason;
    if (APP_PORTS.includes(port)) {
      assert.match(namedPort(port)?.why ?? "", /Mac app/, `${port} is the Mac app's on the list`);
      assert.match(reason, /Mac app's port/, `${port}: the fake says the Mac app's`);
    } else {
      assert.equal(port, HOST_DEFAULT_PORT, `${port} is neither the Mac app's nor the host's default`);
      assert.match(namedPort(port)?.why ?? "", /world host's default/, `${port} is the host's default on the list`);
      assert.match(reason, /world host's default port/, `${port}: the fake says the host's default`);
    }
  }
});

test("the fake's default port is the named list's loops-fake port", () => {
  assert.match(namedPort(FAKE_DEFAULT_PORT)?.why ?? "", /loops-fake/);
});
