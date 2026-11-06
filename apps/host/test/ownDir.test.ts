/* Design choice H1 (round 72, `warn`): the host tightens only a folder it made itself. A folder it was pointed at
   (CREWHUB_WORLD_CONFIG_DIR=~ would have made the home folder 0700) keeps its mode; the start log says once, and the
   doctor warns, when an existing folder is looser than 0700. The files inside stay 0600 either way. */
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { formatDoctor, runDoctor } from "../src/doctor.ts";
import { createKeyStore } from "../src/keyStore.ts";
import { ensureOwnDir, looseFolderLine } from "../src/ownDir.ts";
import { openWorldDb } from "../src/worldDb.ts";

describe("the host's own folder (H1, warn)", () => {
  const scratch = (): string => mkdtempSync(path.join(tmpdir(), "chw-own-"));

  it("is made 0700 when it is not there, and left as it is when it is", () => {
    const base = scratch();
    try {
      const made = path.join(base, "made");
      assert.deepEqual(ensureOwnDir(made), { made: true, loose: null });
      assert.equal(statSync(made).mode & 0o777, 0o700);
      assert.deepEqual(ensureOwnDir(made), { made: false, loose: null }, "private already: nothing to say");
      const pointed = path.join(base, "pointed");
      mkdirSync(pointed, { mode: 0o755 });
      chmodSync(pointed, 0o755);
      assert.deepEqual(ensureOwnDir(pointed), { made: false, loose: 0o755 }, "an existing folder is named loose, not changed");
      assert.equal(statSync(pointed).mode & 0o777, 0o755, "its mode is left alone");
      assert.match(looseFolderLine(pointed, 0o755), /is mode 0755, looser than 0700: the host leaves it as it is/);
      assert.match(looseFolderLine(pointed, 0o755), new RegExp(`chmod 700 "${pointed}"`));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("the stored key and the world database keep a pointed-at folder's mode, their files 0600", () => {
    const base = scratch();
    try {
      const dir = path.join(base, "pointed");
      mkdirSync(dir, { mode: 0o755 });
      chmodSync(dir, 0o755);
      const store = createKeyStore(dir);
      store.save("chl_test_key_0123456789");
      assert.equal(statSync(dir).mode & 0o777, 0o755, "the key store leaves the folder");
      assert.equal(statSync(store.file).mode & 0o777, 0o600);
      const db = openWorldDb(dir);
      db.close();
      assert.equal(statSync(dir).mode & 0o777, 0o755, "the database leaves the folder");
      assert.equal(statSync(db.file).mode & 0o777, 0o600);
      const fresh = path.join(base, "fresh");
      createKeyStore(fresh).save("chl_test_key_0123456789");
      assert.equal(statSync(fresh).mode & 0o777, 0o700, "a folder the host made is 0700, as before");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("the doctor warns on a folder looser than 0700 and says ok on a private one", async () => {
    const base = scratch();
    try {
      const keyFile = path.join(base, "agent-crewhub-world.key");
      writeFileSync(keyFile, `chl_${"x".repeat(40)}\n`, { mode: 0o600 });
      const loose = path.join(base, "loose");
      mkdirSync(loose, { mode: 0o755 });
      chmodSync(loose, 0o755);
      const env = (dir: string) => ({ CREWHUB_WORLD_LOOPS_URL: "http://127.0.0.1:1", CREWHUB_WORLD_KEY_FILE: keyFile, CREWHUB_WORLD_PORT: "5389", CREWHUB_WORLD_CONFIG_DIR: dir });
      const warned = await runDoctor({ env: env(loose), probePort: () => Promise.resolve({ kind: "free" }) });
      const folder = warned.lines.find((l) => l.id === "folder");
      assert.equal(folder?.status, "warn", formatDoctor(warned).join("\n"));
      assert.match(folder?.text ?? "", /mode 0755, looser than 0700/);
      const tight = path.join(base, "tight");
      mkdirSync(tight, { mode: 0o700 });
      chmodSync(tight, 0o700);
      const fine = await runDoctor({ env: env(tight), probePort: () => Promise.resolve({ kind: "free" }) });
      assert.equal(fine.lines.find((l) => l.id === "folder")?.status, "ok");
      assert.equal(statSync(loose).mode & 0o777, 0o755, "the doctor writes nothing");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
