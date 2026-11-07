/* `npm test` in apps/host runs as the root's does (round 54, r53-review CI4): the Node preflight first
   (scripts/check-node.mjs, the major .nvmrc names) and the same per-test timeout, so a test run from the host's own
   folder stops on the wrong Node with one sentence and never waits on a hung test past the root's bound. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scriptsOf = (file: string) => (JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8")) as { scripts: Record<string, string> }).scripts;

test("apps/host's npm test has the root's Node preflight and per-test timeout", () => {
  const root = scriptsOf("../../package.json")["test"] ?? "";
  const host = scriptsOf("../../apps/host/package.json")["test"] ?? "";
  const timeout = /--test-timeout=\d+/.exec(root)?.[0];
  assert.ok(timeout !== undefined, `the root's test has a --test-timeout: ${root}`);
  assert.match(host, /^node \.\.\/\.\.\/scripts\/check-node\.mjs && /, "the host's test starts with the Node preflight");
  assert.ok(host.includes(timeout), `the host's test has the root's ${timeout}: ${host}`);
  assert.ok(host.includes("--import ../../scripts/no-app-reach.mjs"), "and keeps the no-app-reach preload");
});
