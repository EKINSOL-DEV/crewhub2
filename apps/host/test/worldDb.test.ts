/* The world database (round 20): the file and its modes, one row per installation, the revision check, migrations
   with a backup copy, the installation key, and no warning on this Node. Temp folders only. */
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { MIGRATIONS, WORLD_DB_NAME, explainSqliteWarning, installationKey, listBackups, openWorldDb, readBackupTown, type Migration } from "../src/worldDb.ts";

const temp = () => mkdtempSync(path.join(tmpdir(), "chw-worlddb-"));
const DOC = (n: number) => JSON.stringify({ format: "crewhub-town/1", revision: n, styleId: "greenhouse", plots: [], placements: [], userProps: [], rules: {} });

describe("the world database", () => {
  it("creates world.db 0600 in a 0700 folder, one row per installation, the document kept as sent", () => {
    const dir = path.join(temp(), "config");
    const lines: string[] = [];
    const db = openWorldDb(dir, { log: (l) => lines.push(l) });
    try {
      assert.equal(statSync(dir).mode & 0o777, 0o700);
      assert.equal(statSync(db.file).mode & 0o777, 0o600);
      assert.equal(path.basename(db.file), WORLD_DB_NAME);
      assert.equal(db.version, MIGRATIONS.length);
      assert.equal(db.getTown("127.0.0.1-8091"), null);
      const made = db.putTown("127.0.0.1-8091", DOC(0), 0, null, () => "2026-10-22T07:00:00.000Z");
      assert.deepEqual(made, { ok: true, rev: 1 });
      assert.deepEqual(db.getTown("127.0.0.1-8091"), { installation: "127.0.0.1-8091", rev: 1, document: DOC(0), updatedAt: "2026-10-22T07:00:00.000Z", updatedBy: null, canUndo: false, canRedo: false });
      assert.equal(db.getTown("127.0.0.1-8291"), null, "another installation has its own row");
      assert.deepEqual(db.putTown("127.0.0.1-8291", DOC(0), 0), { ok: true, rev: 1 });
      assert.ok(lines.some((l) => /created .*world\.db at schema \d+/.test(l)), lines.join("\n"));
    } finally {
      db.close();
      rmSync(path.dirname(dir), { recursive: true, force: true });
    }
  });

  it("a write names the revision it is based on: another revision in between is a conflict with the town as held, never an overwrite", () => {
    const dir = temp();
    const db = openWorldDb(dir);
    try {
      assert.deepEqual(db.putTown("i", DOC(0), 0), { ok: true, rev: 1 });
      assert.deepEqual(db.putTown("i", DOC(1), 1), { ok: true, rev: 2 });
      // A second browser still on revision 1 writes: refused with revision 2 and its document.
      assert.deepEqual(db.putTown("i", DOC(9), 1), { ok: false, conflict: { rev: 2, document: DOC(1) } });
      assert.equal(db.getTown("i")?.document, DOC(1));
      // Creating over an existing town (the import-once rule's other half) is a conflict too.
      assert.deepEqual(db.putTown("i", DOC(0), 0), { ok: false, conflict: { rev: 2, document: DOC(1) } });
      // The right base goes through.
      assert.deepEqual(db.putTown("i", DOC(2), 2), { ok: true, rev: 3 });
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a reopen keeps the towns; a schema change copies the file to world.db.bak-v<n> first and migrates in one step", () => {
    const dir = temp();
    const first: Migration[] = [MIGRATIONS[0] as Migration];
    const one = openWorldDb(dir, { migrations: first });
    one.putTown("i", DOC(0), 0);
    one.close();
    const again = openWorldDb(dir, { migrations: first });
    assert.deepEqual([again.version, again.backups, again.getTown("i")?.rev], [1, [], 1], "no change, no backup");
    again.close();
    const lines: string[] = [];
    const second: Migration[] = [...first, (db) => db.exec("ALTER TABLE towns ADD COLUMN note TEXT")];
    const two = openWorldDb(dir, { migrations: second, log: (l) => lines.push(l) });
    try {
      const backup = path.join(dir, `${WORLD_DB_NAME}.bak-v1`);
      assert.equal(two.version, 2);
      assert.deepEqual(two.backups, [backup]);
      assert.ok(existsSync(backup));
      assert.equal(statSync(backup).mode & 0o777, 0o600);
      assert.equal(two.getTown("i")?.rev, 1, "the towns survive the migration");
      assert.ok(lines.some((l) => /copied world\.db to world\.db\.bak-v1 before migrating from schema 1 to 2/.test(l)), lines.join("\n"));
      // The backup holds the schema-1 file: it opens at version 1 on its own.
      const copyDir = temp();
      copyFileSync(backup, path.join(copyDir, WORLD_DB_NAME));
      const old = openWorldDb(copyDir, { migrations: first });
      assert.deepEqual([old.version, old.getTown("i")?.rev], [1, 1]);
      old.close();
      rmSync(copyDir, { recursive: true, force: true });
    } finally {
      two.close();
    }
    // A file newer than the host knows is refused, not downgraded.
    assert.throws(() => openWorldDb(dir, { migrations: first }), /newer than this host knows/);
    assert.deepEqual(readdirSync(dir).sort(), [WORLD_DB_NAME, `${WORLD_DB_NAME}.bak-v1`], "the rollback journal leaves nothing behind");
    rmSync(dir, { recursive: true, force: true });
  });

  it("keys an installation like the browser does, and this Node prints no warning for node:sqlite", () => {
    assert.equal(installationKey("http://127.0.0.1:8091"), "127.0.0.1-8091");
    assert.equal(installationKey("http://localhost:8291/"), "localhost-8291");
    assert.throws(() => installationKey("http://"), /no host|Invalid URL/);
    const said: string[] = [];
    const stop = explainSqliteWarning((l) => said.push(l));
    const dir = temp();
    openWorldDb(dir).close();
    rmSync(dir, { recursive: true, force: true });
    stop();
    assert.deepEqual(said, [], "Node 24.21 prints no SQLite warning, so the host says nothing either");
  });
});

describe("the world database's history cap (review F7)", () => {
  it("drops the oldest revisions before the current one when the history passes the byte cap, and never the current one", async () => {
    const { HISTORY_MAX_BYTES, capHistory } = await import("../src/worldDb.ts");
    const doc = (n: number, size: number) => ({ format: "crewhub-town/1", revision: n, styleId: "greenhouse", plots: [], placements: [], userProps: [], rules: {}, note: "x".repeat(size) }) as never;
    const third = Math.ceil(HISTORY_MAX_BYTES / 3);
    const history = { entries: [doc(1, third), doc(2, third), doc(3, third), doc(4, third)], index: 3 };
    const capped = capHistory(history);
    assert.ok(JSON.stringify(capped).length <= HISTORY_MAX_BYTES);
    assert.equal(capped.index, capped.entries.length - 1);
    assert.equal((capped.entries[capped.index] as { revision: number }).revision, 4, "the current one stays");
    assert.ok(capped.entries.length < 4 && capped.entries.length >= 1);
    // The cursor in the middle: the entries after it go first? No: the oldest before it go first; those after only when nothing is left before.
    const mid = capHistory({ entries: [doc(1, third), doc(2, third), doc(3, third), doc(4, third)], index: 1 });
    assert.equal((mid.entries[mid.index] as { revision: number }).revision, 2);
    assert.ok(JSON.stringify(mid).length <= HISTORY_MAX_BYTES);
    const small = { entries: [doc(1, 10), doc(2, 10)], index: 1 };
    assert.equal(capHistory(small), small, "under the cap: the same object");
  });
});

describe("the world database's history (round 21)", () => {
  it("keeps the undo history: a commit, an undo, a redo, an amend, each over its base revision; a step that cannot be taken changes nothing", () => {
    const dir = temp();
    const db = openWorldDb(dir);
    try {
      const a = db.applyTown("i", { kind: "commit", document: DOC(0) }, 0);
      assert.deepEqual(a, { ok: true, rev: 1, document: DOC(0), canUndo: false, canRedo: false, changed: true });
      const b = db.applyTown("i", { kind: "commit", document: DOC(1) }, 1);
      assert.deepEqual([b.ok && b.rev, b.ok && b.canUndo, b.ok && b.canRedo], [2, true, false]);
      const undone = db.applyTown("i", { kind: "undo" }, 2);
      assert.deepEqual([undone.ok && undone.rev, undone.ok && undone.document, undone.ok && undone.canUndo, undone.ok && undone.canRedo], [3, DOC(0), false, true]);
      assert.deepEqual([db.getTown("i")?.document, db.getTown("i")?.canUndo, db.getTown("i")?.canRedo], [DOC(0), false, true], "the read says the same");
      const nothing = db.applyTown("i", { kind: "undo" }, 3);
      assert.deepEqual([nothing.ok && nothing.rev, nothing.ok && nothing.changed], [3, false], "nothing to undo: no new revision");
      const redone = db.applyTown("i", { kind: "redo" }, 3);
      assert.deepEqual([redone.ok && redone.rev, redone.ok && redone.document, redone.ok && redone.canRedo], [4, DOC(1), false]);
      // An amend replaces the current revision in place: no undo step added, the undo still goes to DOC(0).
      const amended = db.applyTown("i", { kind: "amend", document: DOC(7) }, 4);
      // An amend keeps the current revision number (the history's rule), so the stored document is DOC(7) stamped 1.
      assert.deepEqual([amended.ok && amended.rev, amended.ok && JSON.parse(amended.document as string), amended.ok && amended.canUndo], [5, { ...JSON.parse(DOC(7)), revision: 1 }, true]);
      const back = db.applyTown("i", { kind: "undo" }, 5);
      assert.equal(back.ok && back.document, DOC(0));
      // A second browser's undo meets the revision check like any write.
      assert.deepEqual(db.applyTown("i", { kind: "undo" }, 5), { ok: false, conflict: { rev: 6, document: DOC(0) } });
      // Undo on an installation without a town: nothing, revision 0.
      assert.deepEqual(db.applyTown("new", { kind: "undo" }, 0), { ok: true, rev: 0, document: null, canUndo: false, canRedo: false, changed: false });
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a database from schema 1 is copied to world.db.bak-v1 and its towns get a history on the first move; the backup lists and reads", () => {
    const dir = temp();
    const one = openWorldDb(dir, { migrations: [MIGRATIONS[0] as Migration] });
    one.putTown("i", DOC(0), 0);
    one.putTown("i", DOC(1), 1);
    one.close();
    const two = openWorldDb(dir);
    try {
      assert.equal(two.version, 2);
      assert.deepEqual(two.backups, [path.join(dir, "world.db.bak-v1")]);
      assert.deepEqual([two.getTown("i")?.rev, two.getTown("i")?.canUndo], [2, false], "a row from before has one entry: the document as it was");
      const moved = two.applyTown("i", { kind: "commit", document: DOC(2) }, 2);
      assert.deepEqual([moved.ok && moved.rev, moved.ok && moved.canUndo], [3, true]);
      assert.equal(two.applyTown("i", { kind: "undo" }, 3).ok && two.getTown("i")?.document, DOC(1));
      const backups = listBackups(dir);
      assert.deepEqual(backups.map((b) => [b.name, b.version, b.bytes > 0, /^\d{4}-/.test(b.at)]), [["world.db.bak-v1", 1, true, true]]);
      assert.deepEqual(readBackupTown(dir, "world.db.bak-v1", "i"), { rev: 2, document: DOC(1) }, "the copy holds the town as it was before the migration");
      assert.equal(readBackupTown(dir, "world.db.bak-v1", "other"), null);
      assert.equal(readBackupTown(dir, "../world.db", "i"), null, "only a backup's own name is read");
      assert.deepEqual(listBackups(path.join(dir, "nowhere")), []);
    } finally {
      two.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
