import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_HOST_PORT, hostPortPlan, parseHostPort } from "../hostPort.ts";

describe("the host port Vite proxies to", () => {
  it("the dev server defaults to the host's own port; the preview never does, and says so", () => {
    assert.deepEqual(hostPortPlan({}, "dev"), { proxy: true, port: DEFAULT_HOST_PORT });
    assert.deepEqual(hostPortPlan({ CREWHUB_WORLD_PORT: "" }, "dev"), { proxy: true, port: 5180 });
    const preview = hostPortPlan({}, "preview");
    assert.equal(preview.proxy, false);
    assert.equal(preview.port, null);
    assert.match(preview.note, /CREWHUB_WORLD_PORT is not set/);
    assert.match(preview.note, /runs the demo/);
    assert.match(preview.note, /CREWHUB_WORLD_PORT=<the host's port> npm run preview/);
    assert.deepEqual(hostPortPlan({ CREWHUB_WORLD_PORT: "  " }, "preview").proxy, false, "blank is unset");
  });

  it("an explicit port is proxied by both servers", () => {
    assert.deepEqual(hostPortPlan({ CREWHUB_WORLD_PORT: "5194" }, "dev"), { proxy: true, port: 5194 });
    assert.deepEqual(hostPortPlan({ CREWHUB_WORLD_PORT: " 5194 " }, "preview"), { proxy: true, port: 5194 });
  });

  it("a value that is not a port is refused with its name in the message, for either server", () => {
    for (const bad of ["abc", "0", "65536", "51.5", "-1", "5180x"]) {
      assert.equal(parseHostPort(bad), null, bad);
      assert.throws(() => hostPortPlan({ CREWHUB_WORLD_PORT: bad }, "preview"), new RegExp(`CREWHUB_WORLD_PORT=${bad.replace(".", "\\.")} is not a port number`));
      assert.throws(() => hostPortPlan({ CREWHUB_WORLD_PORT: bad }, "dev"), /the dev server does not start/);
    }
    assert.equal(parseHostPort("65535"), 65535);
    assert.equal(parseHostPort("1"), 1);
  });
});

import { devHostVerdict } from "../hostPort.ts";

describe("whose host is on the dev proxy's port", () => {
  const local = { root: "/Users/me/crewhub2-task-x", id: "1b2c3d4e5f60" };
  it("goes on when nothing answers, when it is not a host, when it is this checkout's host, or when the host cannot say", () => {
    const silent = devHostVerdict({ port: 5180, explicit: false, local, answer: { kind: "silent" } });
    assert.equal(silent.ok, true);
    assert.match(silent.line, /^dev: \/world-api and \/pair go to the host on 127\.0\.0\.1:5180 \(the default, CREWHUB_WORLD_PORT=<port> names another\): nothing answers there now, the page runs the demo/);
    const other = devHostVerdict({ port: 5194, explicit: true, local, answer: { kind: "not-a-host" } });
    assert.equal(other.ok, true);
    assert.match(other.line, /127\.0\.0\.1:5194 \(CREWHUB_WORLD_PORT=5194\): what answers there is not the world's host/);
    const mine = devHostVerdict({ port: 5180, explicit: false, local, answer: { kind: "host", checkout: "1b2c3d4e5f60", keyName: "crewhub-world" } });
    assert.equal(mine.ok, true);
    assert.match(mine.line, /this checkout's host \(key crewhub-world\)\.$/);
    const older = devHostVerdict({ port: 5180, explicit: false, local, answer: { kind: "host", checkout: null, keyName: "" } });
    assert.equal(older.ok, true);
    assert.match(older.line, /a host answers \(no key yet\) from before the checkout id in health, so whose it is cannot be told; going on\./);
  });

  it("refuses another checkout's host, naming the port, both checkouts and the way out", () => {
    const verdict = devHostVerdict({ port: 5180, explicit: false, local, answer: { kind: "host", checkout: "9f2c1a7b3d4e", keyName: "crewhub-world" } });
    assert.equal(verdict.ok, false);
    assert.equal(
      verdict.line,
      "The host on 127.0.0.1:5180 (the default, CREWHUB_WORLD_PORT=<port> names another) belongs to another checkout: checkout id 9f2c1a7b3d4e, key crewhub-world. This checkout is /Users/me/crewhub2-task-x (checkout id 1b2c3d4e5f60). The dev server does not start. Start this checkout's host on a port of yours (CREWHUB_WORLD_PORT=<port> npm run host) and this Vite with the same CREWHUB_WORLD_PORT, or stop that host if it is yours.",
    );
    assert.match(devHostVerdict({ port: 5195, explicit: true, local, answer: { kind: "host", checkout: "9f2c1a7b3d4e", keyName: "" } }).line, /^The host on 127\.0\.0\.1:5195 \(CREWHUB_WORLD_PORT=5195\) belongs to another checkout: checkout id 9f2c1a7b3d4e, no key yet\./);
  });
});
