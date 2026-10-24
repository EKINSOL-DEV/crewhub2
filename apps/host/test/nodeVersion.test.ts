/**
 * The host's Node warning (round 12, hostnodewarn): one line at the start when the running major is not `.nvmrc`'s,
 * never a stop; nothing on the right major; the doctor lists it as a warn check and stays ok. The rule is the
 * repository's scripts/check-node.mjs; the host reads .nvmrc the same way. The host's own line is checked by starting
 * main.ts as a child with a faked version (CREWHUB_WORLD_NODE_VERSION, tests only) on a free port against nothing.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { formatDoctor, runDoctor } from "../src/doctor.ts";
import { nodeWarningLine, readNvmrc, runningNodeVersion } from "../src/nodeVersion.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const MAIN = path.join(REPO, "apps", "host", "src", "main.ts");
const WORDS = /Node 24 is what CrewHub World is tested on \(\.nvmrc\); this is v22\.22\.0: run nvm use if anything misbehaves\./;

describe("the host's Node warning", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  it("the rule, reading .nvmrc as the preflight does: a line on another major, nothing on .nvmrc's, nothing without a major", () => {
    assert.equal(readNvmrc(REPO).trim(), "24", "this repository's .nvmrc");
    assert.equal(nodeWarningLine("22.22.0", "24\n"), "Node 24 is what CrewHub World is tested on (.nvmrc); this is v22.22.0: run nvm use if anything misbehaves.");
    assert.equal(nodeWarningLine("v22.22.0", "24"), "Node 24 is what CrewHub World is tested on (.nvmrc); this is v22.22.0: run nvm use if anything misbehaves.");
    assert.equal(nodeWarningLine("24.21.0", "24\n"), null);
    assert.equal(nodeWarningLine("24.21.0", ""), null, "no .nvmrc: nothing to compare with");
    assert.equal(nodeWarningLine(), null, "the tests run on .nvmrc's major");
    assert.equal(runningNodeVersion({}), process.versions.node);
    assert.equal(runningNodeVersion({ CREWHUB_WORLD_NODE_VERSION: "22.22.0" }), "22.22.0", "the tests' stand-in");
  });

  it("the doctor: a warn line first on another major, an ok line on .nvmrc's; the report stays ok either way", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-nodewarn-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const env = { CREWHUB_WORLD_LOOPS_URL: "http://127.0.0.1:1", CREWHUB_WORLD_CONFIG_DIR: dir, CREWHUB_WORLD_PORT: "0" };
    const free = async () => ({ kind: "free" }) as const;
    // The key files are the test's own: the default key file is ~/.config/crewhub-loops/secrets/agent-crewhub-world.key (round 35).
    const keyFiles = { storedKey: path.join(dir, "loops-key"), defaultKey: path.join(dir, "none.key") };
    const warned = await runDoctor({ env, probePort: free, nodeVersion: "22.22.0", keyFiles });
    assert.equal(warned.lines[0]?.id, "node");
    assert.equal(warned.lines[0]?.status, "warn");
    assert.match(warned.lines[0]?.text ?? "", WORDS);
    assert.ok(formatDoctor(warned).some((l) => /^warn  node/.test(l) && WORDS.test(l)), formatDoctor(warned).join("\n"));
    assert.match(formatDoctor(warned).at(-1) ?? "", /\(1 warning\)/);
    const fine = await runDoctor({ env, probePort: free, nodeVersion: "24.21.0", keyFiles });
    assert.deepEqual(fine.lines[0], { id: "node", status: "ok", text: "Node v24.21.0, the major CrewHub World is tested on (.nvmrc)" });
    assert.ok(!formatDoctor(fine).some((l) => /warning/.test(l)));
    // The node line never decides the verdict: only fixes do (loops is down here, so the report is not ok for that reason).
    assert.equal(warned.ok, fine.ok);
  });

  it("the host prints the line once at its start on another major, and nothing on .nvmrc's; it goes on either way", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-nodewarn-host-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    // A key file of the test's own: without one the host reads the default, ~/.config/crewhub-loops/secrets (round 35).
    const keyFile = path.join(dir, "agent-crewhub-world.key");
    writeFileSync(keyFile, `chl_${"x".repeat(32)}\n`, { mode: 0o600 });
    const start = (fakedVersion: string | null) =>
      new Promise<{ lines: string[]; listening: boolean }>((resolve) => {
        const env = { ...process.env, CREWHUB_WORLD_LOOPS_URL: "http://127.0.0.1:1", CREWHUB_WORLD_CONFIG_DIR: dir, CREWHUB_WORLD_KEY_FILE: keyFile, CREWHUB_WORLD_PORT: "0", CREWHUB_WORLD_PAIRING: "off", ...(fakedVersion === null ? {} : { CREWHUB_WORLD_NODE_VERSION: fakedVersion }) };
        const child = spawn(process.execPath, [MAIN], { env, stdio: ["ignore", "pipe", "pipe"] });
        const lines: string[] = [];
        let text = "";
        const timer = setTimeout(() => finish(false), 15000);
        const finish = (listening: boolean) => {
          clearTimeout(timer);
          child.kill();
          resolve({ lines, listening });
        };
        child.stderr.on("data", (chunk: Buffer) => {
          text += chunk.toString();
          lines.splice(0, lines.length, ...text.split("\n").filter((l) => l !== ""));
          if (/\[host\] listening on/.test(text)) finish(true);
        });
        child.on("exit", () => finish(/\[host\] listening on/.test(text)));
      });
    const other = await start("22.22.0");
    assert.ok(other.listening, `the host went on and listened: ${other.lines.join(" | ")}`);
    assert.equal(other.lines.filter((l) => WORDS.test(l)).length, 1, `once: ${other.lines.join(" | ")}`);
    assert.ok(other.lines.findIndex((l) => WORDS.test(l)) < other.lines.findIndex((l) => /listening on/.test(l)), "said at the start");
    const fine = await start(null);
    assert.ok(fine.listening);
    assert.equal(fine.lines.filter((l) => /is what CrewHub World is tested on/.test(l)).length, 0, `nothing on .nvmrc's major: ${fine.lines.join(" | ")}`);
  });
});
