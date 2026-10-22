/* The world database (round 20): the file and its modes, one row per installation, the revision check, migrations
   with a backup copy, the installation key, and no warning on this Node. Temp folders only. */
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { MIGRATIONS, WORLD_DB_NAME, explainSqliteWarning, installationKey, openWorldDb, type Migration } from "../src/worldDb.ts";

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
      assert.deepEqual(db.getTown("127.0.0.1-8091"), { installation: "127.0.0.1-8091", rev: 1, document: DOC(0), updatedAt: "2026-10-22T07:00:00.000Z", updatedBy: null });
      assert.equal(db.getTown("127.0.0.1-8291"), null, "another installation has its own row");
      assert.deepEqual(db.putTown("127.0.0.1-8291", DOC(0), 0), { ok: true, rev: 1 });
      assert.ok(lines.some((l) => /created .*world\.db at schema 1/.test(l)), lines.join("\n"));
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
    assert.equal(installationKey("https://Loops.Example.org/"), "loops.example.org");
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
