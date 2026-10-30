/**
 * The discovery of crewhub-loops (spec addendum "a smooth connection", part 1): the order of the roads, the app's
 * settings.json, the re-search every interval. The disk and the probe are injected: no real folder is read.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appPortOf, candidates, createDiscovery, discoverOnce, targetText } from "../src/discovery.ts";
import type { LoopsTarget } from "../src/transport.ts";
import { waitFor } from "./wait.ts";

const disk = (files: Record<string, string>, sockets: string[] = []) => ({
  readFile: (file: string) => files[file] ?? null,
  statPath: (file: string) => (sockets.includes(file) ? { isSocket: true } : files[file] !== undefined ? { isSocket: false } : null),
});
const nobody = () => Promise.resolve(false);

describe("the discovery", () => {
  it("reads the app's port from settings.json as the app does, else 8091", () => {
    assert.equal(appPortOf(null), 8091);
    assert.equal(appPortOf('{"port": 8291}'), 8291);
    assert.equal(appPortOf('{"port": "8292"}'), 8292);
    assert.equal(appPortOf('{"port": 80}'), 8091, "below 1024 is the default, as in the app");
    assert.equal(appPortOf("{not json"), 8091);
    assert.equal(appPortOf("{}"), 8091);
  });

  it("takes the env's URL or socket as given, without a probe, and names the web app from it", () => {
    const url = candidates({ loopsUrl: "http://127.0.0.1:8291/", loopsSocket: null, loopsWebUrl: null, appData: "/data", ...disk({}) });
    assert.deepEqual(url, [{ via: "env-url", target: { transport: "tcp", url: "http://127.0.0.1:8291/" }, webUrl: "http://127.0.0.1:8291", probe: false }]);
    const socket = candidates({ loopsUrl: null, loopsSocket: "/dev/api.sock", loopsWebUrl: "http://127.0.0.1:8291", appData: "/data", ...disk({}) });
    assert.deepEqual(socket, [{ via: "env-socket", target: { transport: "unix", socketPath: "/dev/api.sock" }, webUrl: "http://127.0.0.1:8291", probe: false }]);
    assert.equal(candidates({ loopsUrl: null, loopsSocket: "/dev/api.sock", loopsWebUrl: null, appData: "/data", ...disk({}) })[0]?.webUrl, "http://127.0.0.1:8091", "a socket has no origin: the app's default port");
  });

  it("looks in the app's data folder: the socket first, then the port from settings.json, both probed", () => {
    const both = candidates({ loopsUrl: null, loopsSocket: null, loopsWebUrl: null, appData: "/data", ...disk({ "/data/settings.json": '{"port": 8291}' }, ["/data/run/api.sock"]) });
    assert.deepEqual(
      both.map((c) => [c.via, targetText(c.target), c.webUrl, c.probe]),
      [
        ["app-socket", "/data/run/api.sock", "http://127.0.0.1:8291", true],
        ["app-port", "http://127.0.0.1:8291", "http://127.0.0.1:8291", true],
      ],
    );
    const portOnly = candidates({ loopsUrl: null, loopsSocket: null, loopsWebUrl: null, appData: "/data", ...disk({}) });
    assert.deepEqual(portOnly.map((c) => [c.via, targetText(c.target)]), [["app-port", "http://127.0.0.1:8091"]], "no socket, no settings: the default port");
    const lockOnly = candidates({ loopsUrl: null, loopsSocket: null, loopsWebUrl: null, appData: "/data", ...disk({ "/data/run/api.sock": "" }) });
    assert.equal(lockOnly[0]?.via, "app-port", "a plain file where the socket should be is no socket");
  });

  it("finds the first road that answers, and nothing when none does", async () => {
    const asked: string[] = [];
    const answers = (target: LoopsTarget) => {
      asked.push(targetText(target));
      return Promise.resolve(target.transport === "tcp");
    };
    const input = { loopsUrl: null, loopsSocket: null, loopsWebUrl: null, appData: "/data", ...disk({ "/data/settings.json": '{"port": 8291}' }, ["/data/run/api.sock"]), answers };
    const found = await discoverOnce(input);
    assert.equal(found?.via, "app-port");
    assert.deepEqual(asked, ["/data/run/api.sock", "http://127.0.0.1:8291"], "the socket was asked first");
    assert.equal(await discoverOnce({ ...input, answers: nobody }), null);
    assert.equal((await discoverOnce({ ...input, loopsUrl: "http://127.0.0.1:1", answers: nobody }))?.via, "env-url", "the env's road needs no answer");
  });

  it("keeps looking every interval until something answers, and says so once", async () => {
    let up = false;
    let probes = 0;
    const changes: (string | null)[] = [];
    const lines: string[] = [];
    const discovery = createDiscovery(
      {
        loopsUrl: null,
        loopsSocket: null,
        loopsWebUrl: null,
        appData: "/data",
        ...disk({}),
        answers: () => {
          probes += 1;
          return Promise.resolve(up);
        },
      },
      { intervalMs: 20, onChange: (found) => changes.push(found === null ? null : found.via), log: (line) => lines.push(line) },
    );
    try {
      assert.equal(await discovery.start(), null);
      assert.deepEqual(discovery.lookedFor(), ["app-port http://127.0.0.1:8091"]);
      // It keeps looking: two more probes after the first pass, each answered "nobody", and still nothing found.
      const afterStart = probes;
      await waitFor("two more probes", () => probes >= afterStart + 2);
      assert.equal(discovery.current(), null, "still searching");
      up = true;
      await waitFor("loops found", () => discovery.current() !== null);
      assert.equal(discovery.current()?.via, "app-port");
      assert.deepEqual(changes, ["app-port"], "null → null is no change; found once");
      assert.ok(lines.some((l) => /looking again every 0.02 s/.test(l)));
      assert.ok(lines.some((l) => /found via app-port/.test(l)));
    } finally {
      discovery.stop();
    }
  });
});
