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
