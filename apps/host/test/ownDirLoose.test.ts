/* Design choice H1 (round 72, `warn`), the edges round 73's mutation run found unpinned: a folder loose by its group
   bits alone, or by the others' bits alone, is loose (the mask is 0o077, not one half of it); the folder's mode is
   printed as four octal digits whatever its value; and a missing path is made whole (recursive). */
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { runDoctor } from "../src/doctor.ts";
import { ensureOwnDir, looseFolderLine, ownDirMode } from "../src/ownDir.ts";

describe("the host's own folder (H1): the loose mask, the octal words, the umask and a missing path", () => {
  const scratch = (): string => mkdtempSync(path.join(tmpdir(), "chw-own-"));
  const folder = (base: string, name: string, mode: number): string => {
    const dir = path.join(base, name);
    mkdirSync(dir, { mode });
    chmodSync(dir, mode);
    return dir;
  };

  it("a folder loose by its group bits alone, or by the others' bits alone, is named loose", () => {
    const base = scratch();
    try {
      const group = folder(base, "group", 0o750);
      const others = folder(base, "others", 0o705);
      assert.deepEqual(ensureOwnDir(group), { made: false, loose: 0o750 }, "group bits alone are loose");
      assert.deepEqual(ensureOwnDir(others), { made: false, loose: 0o705 }, "the others' bits alone are loose");
      assert.equal(statSync(group).mode & 0o777, 0o750, "left as it is");
      assert.equal(statSync(others).mode & 0o777, 0o705, "left as it is");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("the doctor warns on a folder loose by its group bits alone", async () => {
    const base = scratch();
    try {
      const keyFile = path.join(base, "agent-crewhub-world.key");
      writeFileSync(keyFile, `chl_${"x".repeat(40)}\n`, { mode: 0o600 });
      const group = folder(base, "group", 0o750);
      const env = { CREWHUB_WORLD_LOOPS_URL: "http://127.0.0.1:1", CREWHUB_WORLD_KEY_FILE: keyFile, CREWHUB_WORLD_PORT: "5390", CREWHUB_WORLD_CONFIG_DIR: group };
      const report = await runDoctor({ env, probePort: () => Promise.resolve({ kind: "free" }) });
      const line = report.lines.find((l) => l.id === "folder");
      assert.equal(line?.status, "warn", line?.text);
      assert.match(line?.text ?? "", /mode 0750, looser than 0700/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("the mode is said as four octal digits whatever its value", () => {
    assert.match(looseFolderLine("/x", 0o077), /is mode 0077,/);
    assert.match(looseFolderLine("/x", 0o007), /is mode 0007,/);
    assert.match(looseFolderLine("/x", 0o755), /is mode 0755,/);
  });

  it("a missing path is made whole, 0700 at its end", () => {
    const base = scratch();
    try {
      const made = path.join(base, "under", "a", "folder");
      assert.equal(ownDirMode(made), null, "not there yet");
      assert.deepEqual(ensureOwnDir(made), { made: true, loose: null });
      assert.equal(statSync(made).mode & 0o777, 0o700);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
