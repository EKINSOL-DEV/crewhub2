/**
 * Design choice W15 (`viewer-first`): the host's own words send people where the README and the Connect screen do, the
 * viewer card (crewhub-loops' Settings > Agents > Connect CrewHub World, whose key also shows the chat bubbles) first,
 * and the older road (New external bot, whose key shows no bubbles) second, for an older crewhub-loops: the reason a
 * rejected key gives (four reasons share the sentence) and the doctor's "no key yet" fix.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { type DoctorIo, runDoctor } from "../src/doctor.ts";
import { BUILDER_REASON, PERSON_REASON, PROBE_REASON, READER_REASON } from "../src/keyCheck.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";

/** The viewer card is named, and before the older road. */
function viewerFirst(text: string): boolean {
  const viewer = text.indexOf("Connect CrewHub World");
  const older = text.indexOf("New external bot");
  return viewer >= 0 && older > viewer;
}

describe("W15: the host's words name the viewer card first", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });

  it("the four rejection reasons name Connect CrewHub World first and New external bot for an older crewhub-loops", () => {
    for (const reason of [PROBE_REASON, READER_REASON, BUILDER_REASON, PERSON_REASON]) {
      assert.ok(viewerFirst(reason), reason);
      assert.match(reason, /on an older crewhub-loops, Settings > Agents > New external bot/);
    }
  });

  it("the doctor's no-key fix names Connect CrewHub World first and New external bot for an older crewhub-loops", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const dir = mkdtempSync(path.join(tmpdir(), "chw-w15-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const free: DoctorIo["probePort"] = () => Promise.resolve({ kind: "free" });
    const report = await runDoctor({
      env: { CREWHUB_WORLD_LOOPS_URL: stub.url, CREWHUB_WORLD_CONFIG_DIR: path.join(dir, "cw") },
      probePort: free,
      keyFiles: { storedKey: path.join(dir, "cw", "loops-key"), defaultKey: path.join(dir, "none.key") },
    });
    const key = report.lines.find((l) => l.id === "key");
    assert.equal(key?.status, "fix");
    assert.ok(viewerFirst(key!.text), key!.text);
    assert.match(key!.text, /no key yet .*Connect screen.*Connect CrewHub World.*on an older crewhub-loops, Settings > Agents > New external bot/);
  });
});
