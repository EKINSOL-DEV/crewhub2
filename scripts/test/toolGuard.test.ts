/* The tools' rule "your own ports and folders" (tools/lib/toolGuard.ts, round 36): a port option must be named and may
   be neither 5180 (the host's default, Nicky's real host) nor the Mac app's; an app data folder must be named, not the
   app's, and hold a settings.json naming a port that is neither. */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { APP_DATA_PARTS, APP_PORTS, HOST_DEFAULT_PORT, appDataPort, expandHome, ownAppData, ownPort } from "../../tools/lib/toolGuard.ts";

const HOME = "/Users/someone";
const reason = (v: { ok: boolean; reason?: string }) => (v.ok ? "" : (v.reason as string));

test("the constants are the team's rules", () => {
  assert.deepEqual(APP_PORTS, [8091, 8000, 9443]);
  assert.equal(HOST_DEFAULT_PORT, 5180);
  assert.deepEqual(APP_DATA_PARTS, ["Library", "Application Support", "be.ekinsol.crewhub"]);
});

test("ownPort: a named port of your own passes; empty, 5180 and the Mac app's are refused with the reason", () => {
  assert.deepEqual(ownPort("5181", "--host-port"), { ok: true, value: 5181 });
  assert.deepEqual(ownPort(5296, "--port"), { ok: true, value: 5296 });
  assert.deepEqual(ownPort(" 8291 ", "--port"), { ok: true, value: 8291 });
  assert.match(reason(ownPort("", "--host-port")), /--host-port <port> is required: a port of your own, never 5180 .* nor 8091, 8000, 9443/);
  assert.match(reason(ownPort(null, "--port")), /--port <port> is required/);
  assert.match(reason(ownPort(undefined, "--port")), /--port <port> is required/);
  assert.match(reason(ownPort("5180", "--port")), /the host's default port/);
  assert.match(reason(ownPort(5180, "--host-port")), /--host-port 5180: that is the host's default port/);
  for (const port of APP_PORTS) assert.match(reason(ownPort(String(port), "--stub-port")), new RegExp(`--stub-port ${port}: that is the Mac app's port`));
  assert.match(reason(ownPort("abc", "--port")), /must be a port number, not "abc"/);
  assert.match(reason(ownPort("70000", "--port")), /must be a port number/);
  assert.match(reason(ownPort("-1", "--port")), /must be a port number/);
  assert.match(reason(ownPort("51.8", "--port")), /must be a port number/);
});

test("ownPort: 0 (a free port) only where the tool's own browser opens whatever port came out", () => {
  assert.match(reason(ownPort("0", "--host-port")), /must name the port/);
  assert.deepEqual(ownPort("0", "--host-port", { free: true }), { ok: true, value: 0 });
  assert.match(reason(ownPort("5180", "--host-port", { free: true })), /host's default port/, "free does not open 5180");
  assert.match(reason(ownPort("8091", "--host-port", { free: true })), /Mac app's port/);
});

test("ownAppData: a folder of your own passes (~ expanded, resolved); empty and the Mac app's folder are refused", () => {
  assert.deepEqual(ownAppData("~/crewhub-loops-dev", HOME), { ok: true, value: path.join(HOME, "crewhub-loops-dev") });
  assert.deepEqual(ownAppData("/tmp/x/loops-data", HOME), { ok: true, value: "/tmp/x/loops-data" });
  assert.equal(ownAppData("relative/folder", HOME).ok, true, "a relative folder is resolved against the cwd, as every tool path is");
  assert.match(reason(ownAppData("", HOME)), /empty: a host would read \.\/settings\.json and then probe 8091/);
  assert.match(reason(ownAppData("   ", HOME)), /empty/);
  assert.match(reason(ownAppData(null, HOME)), /empty/);
  const app = path.join(HOME, ...APP_DATA_PARTS);
  assert.match(reason(ownAppData(app, HOME)), /is the Mac app's data folder/);
  assert.match(reason(ownAppData(`${app}/run`, HOME)), /is the Mac app's data folder/);
  assert.match(reason(ownAppData("~/Library/Application Support/be.ekinsol.crewhub", HOME)), /is the Mac app's data folder/);
  assert.equal(ownAppData(`${app}-dev`, HOME).ok, true, "a sibling folder is somebody's own");
  assert.equal(expandHome("~", HOME), HOME);
  assert.equal(expandHome("~user/x", HOME), "~user/x", "only ~ and ~/ are the home");
});

test("appDataPort: the settings.json port as the host reads it; missing, unusable, the app's or 5180 are refused", () => {
  assert.deepEqual(appDataPort('{"port": 8291}'), { ok: true, value: 8291 });
  assert.deepEqual(appDataPort('{"port": "8293"}'), { ok: true, value: 8293 });
  assert.match(reason(appDataPort(null)), /no settings\.json .* fall back to 8091/);
  assert.match(reason(appDataPort("not json")), /no usable port: .* 8091/);
  assert.match(reason(appDataPort("{}")), /no usable port/);
  assert.match(reason(appDataPort('{"port": 80}')), /no usable port/, "below 1024 the host falls back to 8091");
  assert.match(reason(appDataPort('{"port": 70000}')), /no usable port/);
  assert.match(reason(appDataPort('{"port": 8091}')), /8091, the Mac app's/);
  assert.match(reason(appDataPort('{"port": 9443}')), /9443, the Mac app's/);
  assert.match(reason(appDataPort('{"port": 5180}')), /5180, the world host's default/);
});
