/**
 * `npm run host -- doctor`: the terminal view of the connection's states. Run against the stub with an injected disk
 * and port probe: every line's status and the fix it names; never the key; never the stream.
 */
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { plainTime } from "../src/archiveStore.ts";
import { type DoctorIo, formatDoctor, nextStep, runDoctor } from "../src/doctor.ts";
import { PROBE_REASON } from "../src/keyCheck.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

const byId = (report: Awaited<ReturnType<typeof runDoctor>>) => Object.fromEntries(report.lines.map((l) => [l.id, l]));

describe("the doctor", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  function folder(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-doc-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }
  const free: DoctorIo["probePort"] = () => Promise.resolve({ kind: "free" });

  it("says the key is a viewer, reading only, when loops lists it so; else that the external bot could write", async () => {
    for (const viewer of [true, false]) {
      const stub = await createLoopsStub({ ...installation(), keyReadsChat: viewer });
      cleanup.push(() => stub.close());
      const dir = folder();
      const keyFile = path.join(dir, "agent-crewhub-world.key");
      writeFileSync(keyFile, `${stub.key}\n`, { mode: 0o600 });
      const report = await runDoctor({ env: { CREWHUB_WORLD_LOOPS_URL: stub.url, CREWHUB_WORLD_KEY_FILE: keyFile, CREWHUB_WORLD_PORT: "5187", CREWHUB_WORLD_CONFIG_DIR: dir }, probePort: free });
      const lines = byId(report);
      assert.equal(report.ok, true, formatDoctor(report).join("\n"));
      assert.doesNotMatch(lines.auth!.text, /could write/, "the auth line judges nothing it cannot know yet");
      if (viewer) assert.match(lines.agents!.text, /crewhub-world is a viewer: it reads what the world needs and writes nothing/);
      else assert.doesNotMatch(lines.agents!.text, /viewer/);
    }
  });

  it("passes with a good key file, a reachable loops and a free port, and names what it read", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const dir = folder();
    const keyFile = path.join(dir, "agent-crewhub-world.key");
    writeFileSync(keyFile, `${stub.key}\n`, { mode: 0o600 });
    // The doctor reads the host's own folder for the archive memory: this test's folder, never the machine's ~/.config/crewhub-world (a real run leaves one there).
    const report = await runDoctor({ env: { CREWHUB_WORLD_LOOPS_URL: stub.url, CREWHUB_WORLD_KEY_FILE: keyFile, CREWHUB_WORLD_PORT: "5187", CREWHUB_WORLD_CONFIG_DIR: dir }, probePort: free });
    const lines = byId(report);
    assert.equal(report.ok, true, formatDoctor(report).join("\n"));
    assert.deepEqual(report.lines.map((l) => l.id), ["node", "loops", "health", "key", "auth", "projects", "agents", "team", "events", "archive", "port", "pairing"]);
    assert.match(lines.loops!.text, /found via env-url/);
    assert.match(lines.health!.text, /version 053b5f47/);
    assert.match(lines.key!.text, /mode 0600, yours, looks like an access key/);
    assert.match(lines.auth!.text, /crewhub-world \(World\), role lead: an external bot's key/);
    assert.match(lines.projects!.text, /2 projects: atlas, beacon/);
    assert.match(lines.agents!.text, /1 agent/);
    assert.match(lines.team!.text, /0 sessions/);
    assert.match(lines.events!.text, /tail is seq 0 \(sealed cursor present\)/);
    assert.match(lines.archive!.text, /^no archived projects remembered yet/);
    assert.match(lines.port!.text, /5187 is free/);
    assert.match(lines.pairing!.text, /^on/);
    assert.equal(stub.streamsOpened(), 0, "the doctor never opens the stream");
    assert.ok(stub.requests.every((r) => r.method === "GET"), "the doctor never writes");
    const text = formatDoctor(report).join("\n");
    assert.ok(!text.includes(stub.key), "never the key");
    assert.match(text, /doctor: all 12 checks ok/);
  });

  it("names the remembered archive: its count and the loops it was learnt from; a broken memory is a fix", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const dir = folder();
    const keyFile = path.join(dir, "agent-crewhub-world.key");
    writeFileSync(keyFile, `${stub.key}\n`, { mode: 0o600 });
    const configDir = path.join(dir, "cw");
    mkdirSync(configDir, { mode: 0o700 });
    const env = { CREWHUB_WORLD_LOOPS_URL: stub.url, CREWHUB_WORLD_KEY_FILE: keyFile, CREWHUB_WORLD_CONFIG_DIR: configDir };
    writeFileSync(path.join(configDir, "archived.json"), JSON.stringify({ v: 1, slugs: ["ops-tooling", "beacon"], at: "2026-10-21T01:50:06Z", target: stub.url }), { mode: 0o600 });
    const remembered = byId(await runDoctor({ env, probePort: free }));
    assert.equal(remembered.archive!.status, "ok");
    assert.match(remembered.archive!.text, /^remembers 2 archived projects \(beacon, ops-tooling\) from http:\/\/127\.0\.0\.1:\d+, learnt 2026-10-21 01:50:06 UTC/);
    writeFileSync(path.join(configDir, "archived.json"), "{not json", { mode: 0o600 });
    const broken = byId(await runDoctor({ env, probePort: free }));
    assert.equal(broken.archive!.status, "fix");
    assert.match(broken.archive!.text, /is not an archive memory: delete it/);
  });

  it("names the fix: a missing key (the Connect screen), a world-readable file, a bogus key, a probe key", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const dir = folder();
    const base = { CREWHUB_WORLD_LOOPS_URL: stub.url, CREWHUB_WORLD_CONFIG_DIR: path.join(dir, "cw") };
    const none = byId(await runDoctor({ env: base, probePort: free, keyFiles: { storedKey: path.join(dir, "cw", "loops-key"), defaultKey: path.join(dir, "none.key") } }));
    assert.equal(none.key!.status, "fix");
    assert.match(none.key!.text, /no key yet .*Connect screen.*New external bot/);
    assert.equal(none.auth!.status, "skip");

    const open = path.join(dir, "open.key");
    writeFileSync(open, stub.key);
    chmodSync(open, 0o644);
    const readable = byId(await runDoctor({ env: { ...base, CREWHUB_WORLD_KEY_FILE: open }, probePort: free }));
    assert.equal(readable.key!.status, "fix");
    assert.match(readable.key!.text, /mode 0644 lets others read it: chmod 600/);
    assert.equal(readable.auth!.status, "ok", "the key itself works; the file's mode is the fix");

    const bogus = path.join(dir, "bogus.key");
    writeFileSync(bogus, "chl_nope\n", { mode: 0o600 });
    const wrong = byId(await runDoctor({ env: { ...base, CREWHUB_WORLD_KEY_FILE: bogus }, probePort: free }));
    assert.equal(wrong.key!.status, "fix");
    assert.match(wrong.key!.text, /not an access key/);
    assert.equal(wrong.auth!.status, "fix");
    assert.match(wrong.auth!.text, /does not know this key/);

    const probe = await createLoopsStub({ ...installation(), routes: { ...installation().routes, "/api/auth/me": { principal: { id: "crewhub-world", kind: "agent", displayName: "World", role: "probe" } } } });
    cleanup.push(() => probe.close());
    const good = path.join(dir, "agent-crewhub-world.key");
    writeFileSync(good, probe.key, { mode: 0o600 });
    const probed = byId(await runDoctor({ env: { CREWHUB_WORLD_LOOPS_URL: probe.url, CREWHUB_WORLD_KEY_FILE: good }, probePort: free }));
    assert.equal(probed.auth!.text, PROBE_REASON);
    assert.equal(probed.projects!.status, "skip");
    const missing = byId(await runDoctor({ env: { ...base, CREWHUB_WORLD_KEY_FILE: path.join(dir, "gone.key") }, probePort: free }));
    assert.match(missing.key!.text, /cannot read the key file .*gone\.key/);
  });

  it("says what it looked for when nothing answers, and what listens on the host's port", async () => {
    const dir = folder();
    mkdirSync(path.join(dir, "run"));
    const closed = await freePort();
    writeFileSync(path.join(dir, "settings.json"), `{"port": ${closed}}`);
    const down = await runDoctor({ env: { CREWHUB_WORLD_LOOPS_APP_DATA: dir }, probePort: free });
    const lines = byId(down);
    assert.equal(down.ok, false);
    assert.ok(lines.loops!.text.startsWith(`nothing answers; looked for app-port http://127.0.0.1:${closed}. Open Crewhub.app`), lines.loops!.text);
    assert.equal(lines.health!.status, "skip");
    assert.equal(lines.auth!.status, "skip");
    assert.match(formatDoctor(down).at(-1) as string, /doctor: \d+ to fix, \d+ skipped/);

    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const env = { CREWHUB_WORLD_LOOPS_URL: stub.url, CREWHUB_WORLD_KEY_FILE: path.join(dir, "k.key") };
    writeFileSync(env.CREWHUB_WORLD_KEY_FILE, stub.key, { mode: 0o600 });
    const running = byId(await runDoctor({ env, probePort: () => Promise.resolve({ kind: "host", health: { loops: "ok", keyName: "crewhub-world", connection: { stream: { state: "ok" }, key: { state: "ok" } } } }) }));
    assert.equal(running.port!.status, "ok");
    assert.match(running.port!.text, /a host already runs .* asks it for a link/);
    const keyless = byId(await runDoctor({ env, probePort: () => Promise.resolve({ kind: "host", health: { loops: "unauthorized", keyName: "", connection: { stream: { state: "idle" }, key: { state: "none" } } } }) }));
    assert.equal(keyless.port!.status, "ok", "no key is not a port problem: the paste fixes it without a restart");
    assert.match(keyless.port!.text, /waits for a key: paste it in the world's Connect screen/);
    assert.doesNotMatch(keyless.port!.text, /restart it/);
    const searching = byId(await runDoctor({ env, probePort: () => Promise.resolve({ kind: "host", health: { loops: "down", keyName: "", connection: { discovery: { state: "searching" }, stream: { state: "idle" }, key: { state: "ok" } } } }) }));
    assert.equal(searching.port!.status, "fix");
    assert.match(searching.port!.text, /open Crewhub.app; the host looks again every 5 s, no restart needed/);
    const taken = byId(await runDoctor({ env, probePort: () => Promise.resolve({ kind: "taken" }) }));
    assert.match(taken.port!.text, /something else listens/);
  });
});

describe("the doctor's words", () => {
  it("prints the archive's time as a person reads it, never with milliseconds", () => {
    assert.equal(plainTime("2026-10-21T04:56:46.430Z"), "2026-10-21 04:56:46 UTC");
    assert.equal(plainTime("2026-10-21T01:50:06Z"), "2026-10-21 01:50:06 UTC");
    assert.equal(plainTime("yesterday"), "yesterday");
  });
  it("ends with the world being up when a host already runs, else with npm run world", () => {
    const line = (text: string) => ({ lines: [{ id: "port", status: "ok" as const, text }], ok: true });
    assert.equal(nextStep(line("a host already runs on 127.0.0.1:5195 (loops ok, key crewhub-world); npm run world or npm run host -- open asks it for a link")), "The world is up: npm run world opens the browser on a new link");
    assert.equal(nextStep(line("127.0.0.1:5180 is free")), "Next: npm run world");
    assert.match(formatDoctor(line("127.0.0.1:5180 is free")).at(-1)!, /all 1 checks ok\. Next: npm run world$/);
  });
});
