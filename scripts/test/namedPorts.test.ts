/* The one named-port list (scripts/named-ports.mjs, round 57d, docs/proposals/mutation-harness.md §5b.4): every port no
   test aims at and no tool takes as its own, each with whose it is. The test preload (no-app-reach.mjs) and the tools'
   rule (tools/lib/toolGuard.ts) read this one list: the checks below are pure (the lists themselves, never a socket). */
import assert from "node:assert/strict";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";
import * as appData from "../app-data.mjs";
import * as named from "../named-ports.mjs";
import * as guard from "../no-app-reach.mjs";
import * as seed from "../../tools/lib/seed.ts";
import * as tools from "../../tools/lib/toolGuard.ts";

test("the list: the nine named ports, each with whose it is, the Mac app's three and the development loops' three", () => {
  assert.deepEqual(
    named.NAMED_PORTS.map((p) => p.port),
    [8091, 8000, 9443, 8291, 8292, 8293, 8391, 5180, 5173],
  );
  for (const p of named.NAMED_PORTS) assert.match(p.why, /\w/, `port ${p.port} says whose it is`);
  assert.equal(new Set(named.NAMED_PORTS.map((p) => p.port)).size, named.NAMED_PORTS.length, "no port twice");
  assert.deepEqual(named.APP_PORTS, [8091, 8000, 9443]);
  assert.deepEqual(named.DEV_LOOPS_PORTS, [8291, 8292, 8293]);
  assert.equal(named.HOST_DEFAULT_PORT, 5180);
  assert.equal(named.VITE_PORT, 5173);
  assert.ok(Object.isFrozen(named.NAMED_PORTS) && named.NAMED_PORTS.every((p) => Object.isFrozen(p)), "nobody edits the list in passing");
  assert.ok(Object.isFrozen(named.APP_PORTS) && Object.isFrozen(named.DEV_LOOPS_PORTS));
  assert.match(named.namedPort(8091)?.why ?? "", /Mac app/);
  assert.match(named.namedPort(8293)?.why ?? "", /development crewhub-loops/);
  assert.equal(named.namedPort(5389), undefined, "a port of one's own is not named");
  assert.equal(named.namedPort(0), undefined);
});

test("the test preload reads the list: the same arrays, every named port refused for a connect, all but Vite's for a listen", () => {
  assert.equal(guard.APP_PORTS, named.APP_PORTS, "no-app-reach's APP_PORTS is the list's own array, not a copy");
  assert.deepEqual([...guard.OTHER_PORTS.keys()], named.NAMED_PORTS.filter((p) => !named.APP_PORTS.includes(p.port)).map((p) => p.port));
  for (const p of named.NAMED_PORTS) {
    if (!named.APP_PORTS.includes(p.port)) assert.equal(guard.OTHER_PORTS.get(p.port), p.why, `port ${p.port}: the preload's words are the list's`);
    assert.notEqual(guard.refusesConnect([{ port: p.port, host: "127.0.0.1" }], null), null, `a connect to ${p.port}`);
  }
  assert.deepEqual(guard.LISTEN_PORTS, named.NAMED_PORTS.map((p) => p.port).filter((port) => port !== named.VITE_PORT));
});

test("the tools' rule reads the list: the same arrays, and the host's default port is the list's", () => {
  assert.equal(tools.APP_PORTS, named.APP_PORTS, "toolGuard's APP_PORTS is the list's own array, not a copy");
  assert.equal(tools.HOST_DEFAULT_PORT, named.HOST_DEFAULT_PORT);
  for (const p of named.NAMED_PORTS) assert.equal(tools.ownPort(p.port, "--port").ok, false, `a tool's own port is never ${p.port}`);
});

test("the seed tool's URL guard reads the list: its refused ports are the Mac app's own array, and each is refused by the guard (round 60, pk-P3)", () => {
  assert.equal(seed.REFUSED_PORTS, named.APP_PORTS, "seed.ts's REFUSED_PORTS is the list's own array, not a second list");
  for (const port of named.APP_PORTS) assert.match((seed.checkUrl(`http://127.0.0.1:${port}`) as { reason: string }).reason, /reserved/, `port ${port}`);
  assert.equal(seed.checkUrl("http://127.0.0.1:8291").ok, true, "the development loops stays a seed target");
});

test("the Mac app's data folder is spelled once (scripts/app-data.mjs): the preload and the tools' rule hold that array, not a copy", () => {
  assert.deepEqual(appData.APP_DATA_PARTS, ["Library", "Application Support", "be.ekinsol.crewhub"]);
  assert.ok(Object.isFrozen(appData.APP_DATA_PARTS));
  assert.equal(guard.APP_DATA_PARTS, appData.APP_DATA_PARTS, "no-app-reach's APP_DATA_PARTS is the one array");
  assert.equal(tools.APP_DATA_PARTS, appData.APP_DATA_PARTS, "toolGuard's APP_DATA_PARTS is the one array");
  assert.equal(guard.APP_DATA, path.join(homedir(), ...appData.APP_DATA_PARTS));
  for (const home of guard.guardedHomes({}, "/Users/someone", "/Users/someone")) assert.ok(guard.guardedFolders([home]).some((f) => f.dir === path.join(home, ...appData.APP_DATA_PARTS) && /Mac app/.test(f.why)), "the preload's folder rule is built from it");
});
