/* testHost() (round 57d, testHost.ts): a test's host is aimed, by a URL, a socket, or an app data folder whose
   settings.json names a port of the test's own; otherwise the test fails before a host exists, not on the guard's
   refusal of a probe of 8091. The checks are pure (the disk injected as the discovery's readFile) but one, which
   reads a temp folder of the test's own. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { testHost, untargeted } from "./testHost.ts";

const settingsOnly = (text: string | null) => (file: string) => (path.basename(file) === "settings.json" ? text : null);

describe("testHost", () => {
  it("passes a host with a URL or a socket, whatever the discovery says", () => {
    assert.equal(untargeted({ loopsUrl: "http://127.0.0.1:1" }), null);
    assert.equal(untargeted({ loopsSocket: "/tmp/chw-x/api.sock" }), null);
  });

  it("passes an app data folder whose settings.json names a port of the test's own", () => {
    assert.equal(untargeted({ discovery: { appData: "/tmp/chw-app", readFile: settingsOnly('{"port": 51234}\n') } }), null);
    assert.equal(untargeted({ discovery: { appData: "/tmp/chw-app", readFile: settingsOnly('{"port": "51234"}') } }), null);
  });

  it("refuses a host with no target and no app data folder", () => {
    assert.match(untargeted({}) ?? "", /^testHost: no loopsUrl, no loopsSocket and no discovery\.appData: .* probe 8091/);
    assert.match(untargeted({ discovery: { intervalMs: 40 } }) ?? "", /no discovery\.appData/);
    assert.match(untargeted({ discovery: { appData: "" } }) ?? "", /no discovery\.appData/);
  });

  it("refuses an app data folder without a settings.json, or one that names no port of the test's own", () => {
    assert.match(untargeted({ discovery: { appData: "/tmp/chw-app", readFile: settingsOnly(null) } }) ?? "", /^testHost: \/tmp\/chw-app\/settings\.json is missing: .* probe 8091/);
    for (const text of ["", "not json", "{}", '{"port": 80}', '{"port": 70000}', '{"port": 8091}'])
      assert.match(untargeted({ discovery: { appData: "/tmp/chw-app", readFile: settingsOnly(text) } }) ?? "", /names no port of the test's own: the discovery would probe 8091/, text);
  });

  it("reads the disk when the test injected no readFile: a temp folder without and then with its settings.json", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-testhost-"));
    try {
      assert.match(untargeted({ discovery: { appData: dir } }) ?? "", /settings\.json is missing/);
      writeFileSync(path.join(dir, "settings.json"), '{"port": 51234}\n');
      assert.equal(untargeted({ discovery: { appData: dir } }), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("testHost throws the reason before building a host", async () => {
    await assert.rejects(testHost({ pairing: "off" }), /^Error: testHost: no loopsUrl/);
    await assert.rejects(testHost({ discovery: { appData: "/tmp/chw-app", readFile: settingsOnly(null), intervalMs: 40 } }), /settings\.json is missing/);
  });
});
