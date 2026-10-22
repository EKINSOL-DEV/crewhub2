/**
 * The world database, first slice (spec addendum "the world database, first slice"): the live town document per
 * crewhub-loops installation, kept by the host in `<configDir>/world.db` with Node 24's built-in `node:sqlite`
 * (`DatabaseSync`; no dependency). Mode 0600 in the 0700 folder, like the stored key beside it; the rollback journal
 * (the default) leaves nothing but `world.db` between writes.
 *
 * Tables: `schema_version(version)` with one row, and `towns(installation PRIMARY KEY, rev, document, updated_at,
 * updated_by)`: one row per installation, keyed like the browser's town key (`installationKey`: the host and port of the
 * loops web app, `127.0.0.1-8091`). Migrations are the list below, applied in a transaction on open; before a schema
 * change on a file that already has a schema, the file is copied to `world.db.bak-v<current>` beside it (never
 * overwritten). A document is kept as the browser sent it, text, so an export is the same bytes.
 *
 * Writes carry the revision they are based on: `putTown` answers a conflict instead of overwriting another browser's
 * revision (last write wins with a check; the browser reloads and says so).
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const WORLD_DB_NAME = "world.db";
export const TOWN_FORMAT = "crewhub-town/1";
/** The largest document the host takes on `PUT /world-api/town` (the document's own limits keep a town far below). */
export const TOWN_BODY_LIMIT = 4 * 1024 * 1024;

export type Migration = (db: DatabaseSync) => void;

/** The schema, version by version. Add a step at the end; never change an earlier one. */
export const MIGRATIONS: readonly Migration[] = [
  (db) => {
    db.exec(
      "CREATE TABLE towns (installation TEXT PRIMARY KEY, rev INTEGER NOT NULL, document TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)",
    );
  },
];

/** The key of an installation's town: the host and port of its web app, as the browser keys its town (`liveTownKey`). */
export function installationKey(loopsWebUrl: string): string {
  const host = new URL(loopsWebUrl).host.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  if (host === "") throw new Error(`no host in ${loopsWebUrl}`);
  return host;
}

export interface StoredTown {
  installation: string;
  rev: number;
  /** The document's JSON text, as the browser sent it. */
  document: string;
  updatedAt: string;
  updatedBy: string | null;
}

export type PutOutcome = { ok: true; rev: number } | { ok: false; conflict: { rev: number; document: string | null } };

export interface WorldDb {
  /** The file. For the log and health. */
  file: string;
  /** The schema version the file is at. */
  version: number;
  /** Backup copies made at this open (`world.db.bak-v<n>`), for the log. */
  backups: string[];
  getTown(installation: string): StoredTown | null;
  /** Writes a revision over `baseRev` (0 creates); a conflict when the host holds another revision. */
  putTown(installation: string, document: string, baseRev: number, updatedBy?: string | null, now?: () => string): PutOutcome;
  close(): void;
}

export interface WorldDbOptions {
  log?: (line: string) => void;
  /** Tests: a schema of their own, to see a migration and its backup happen. */
  migrations?: readonly Migration[];
}

/** Opens (or creates) the database in `configDir`, migrates it, and answers the store. Throws when the folder or the file cannot be made. */
export function openWorldDb(configDir: string, options: WorldDbOptions = {}): WorldDb {
  const log = options.log ?? (() => undefined);
  const migrations = options.migrations ?? MIGRATIONS;
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  chmodSync(configDir, 0o700);
  const file = path.join(configDir, WORLD_DB_NAME);
  const existed = existsSync(file);
  const db = new DatabaseSync(file);
  chmodSync(file, 0o600);
  db.exec("PRAGMA journal_mode = DELETE");
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  const backups: string[] = [];
  if (version > migrations.length) {
    db.close();
    throw new Error(`${file} is at schema version ${version}, newer than this host knows (${migrations.length}): update the host, or move the file away`);
  }
  if (version < migrations.length) {
    if (existed && version > 0) {
      // A copy before the schema changes, named after the version it holds; a second change at the same version keeps the first copy.
      const backup = `${file}.bak-v${version}`;
      if (!existsSync(backup)) {
        copyFileSync(file, backup);
        chmodSync(backup, 0o600);
        backups.push(backup);
        log(`world database: copied ${path.basename(file)} to ${path.basename(backup)} before migrating from schema ${version} to ${migrations.length}`);
      }
    }
    db.exec("BEGIN");
    try {
      for (let v = version; v < migrations.length; v += 1) (migrations[v] as Migration)(db);
      if (row === undefined) db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(migrations.length);
      else db.prepare("UPDATE schema_version SET version = ?").run(migrations.length);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
    version = migrations.length;
    log(`world database: ${existed ? "migrated" : "created"} ${file} at schema ${version}`);
  }
  const select = db.prepare("SELECT installation, rev, document, updated_at AS updatedAt, updated_by AS updatedBy FROM towns WHERE installation = ?");
  const insert = db.prepare("INSERT INTO towns (installation, rev, document, updated_at, updated_by) VALUES (?, 1, ?, ?, ?)");
  const update = db.prepare("UPDATE towns SET rev = rev + 1, document = ?, updated_at = ?, updated_by = ? WHERE installation = ? AND rev = ?");
  const revOf = db.prepare("SELECT rev FROM towns WHERE installation = ?");
  return {
    file,
    version,
    backups,
    getTown(installation) {
      const found = select.get(installation) as (Omit<StoredTown, "updatedBy"> & { updatedBy: string | null }) | undefined;
      return found === undefined ? null : { ...found, updatedBy: found.updatedBy ?? null };
    },
    putTown(installation, document, baseRev, updatedBy = null, now = () => new Date().toISOString()) {
      const at = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const current = (revOf.get(installation) as { rev: number } | undefined)?.rev ?? 0;
        if (current !== baseRev) {
          db.exec("ROLLBACK");
          const held = this.getTown(installation);
          return { ok: false, conflict: { rev: current, document: held?.document ?? null } };
        }
        if (current === 0) insert.run(installation, document, at, updatedBy);
        else update.run(document, at, updatedBy, installation, baseRev);
        db.exec("COMMIT");
        return { ok: true, rev: current + 1 };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}

/**
 * Node 24.21 prints no warning for `node:sqlite`; an older 24.x printed `ExperimentalWarning: SQLite is an experimental
 * feature` once, at the first open. The host hides no warning (it never runs with `--no-warnings`): it only says, once
 * and after Node's own line, that this one is expected. Every other warning prints as Node prints it.
 */
export function explainSqliteWarning(log: (line: string) => void): () => void {
  let said = false;
  const listener = (warning: Error) => {
    if (said || warning.name !== "ExperimentalWarning" || !/sqlite/i.test(warning.message)) return;
    said = true;
    log("the line above is Node's note that node:sqlite is still marked experimental on this Node; the host expects it and hides nothing else");
  };
  process.on("warning", listener);
  return () => {
    process.off("warning", listener);
  };
}
