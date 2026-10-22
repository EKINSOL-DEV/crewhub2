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
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { amendHistory, canRedo, canUndo, commitHistory, createHistory, currentDocument, redoHistory, undoHistory, type TownHistory } from "@crewhub/world-model";

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
  // Round 21: the undo history is the host's (the browser's pure history, JSON: the last 50 revisions and a cursor).
  (db) => {
    db.exec("ALTER TABLE towns ADD COLUMN history TEXT");
  },
];

/** A file name of a backup copy: `world.db.bak-v<n>`. */
export const BACKUP_NAME = /^world\.db\.bak-v(\d+)$/;

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
  /** Whether the host's history has a step back or forward from here. */
  canUndo: boolean;
  canRedo: boolean;
}

export type PutOutcome = { ok: true; rev: number } | { ok: false; conflict: { rev: number; document: string | null } };

/** One move of the host's history: a person's edit, the world's own record, a step back or forward. */
export type TownOp = { kind: "commit" | "amend"; document: string } | { kind: "undo" | "redo" };

export type ApplyOutcome =
  | { ok: true; rev: number; document: string | null; canUndo: boolean; canRedo: boolean; changed: boolean }
  | { ok: false; conflict: { rev: number; document: string | null } };

export interface BackupInfo {
  name: string;
  /** The schema version the copy holds (from its name). */
  version: number;
  bytes: number;
  /** The copy's time on disk, ISO 8601. */
  at: string;
}

export interface WorldDb {
  /** The file. For the log and health. */
  file: string;
  /** The schema version the file is at. */
  version: number;
  /** Backup copies made at this open (`world.db.bak-v<n>`), for the log. */
  backups: string[];
  getTown(installation: string): StoredTown | null;
  /** Writes a revision over `baseRev` (0 creates); a conflict when the host holds another revision. A commit, in the history's words. */
  putTown(installation: string, document: string, baseRev: number, updatedBy?: string | null, now?: () => string): PutOutcome;
  /**
   * Moves the installation's history (round 21): a commit or an amend with a document, an undo or a redo without one,
   * each over `baseRev`. The current document after the move comes back with the new revision; a step that cannot be
   * taken (nothing to undo) changes nothing and answers the revision as it is (`changed` false).
   */
  applyTown(installation: string, op: TownOp, baseRev: number, updatedBy?: string | null, now?: () => string): ApplyOutcome;
  close(): void;
}

/** The backup copies beside the database, newest version first. */
export function listBackups(configDir: string): BackupInfo[] {
  let names: string[];
  try {
    names = readdirSync(configDir);
  } catch {
    return [];
  }
  const out: BackupInfo[] = [];
  for (const name of names) {
    const m = BACKUP_NAME.exec(name);
    if (m === null) continue;
    try {
      const info = statSync(path.join(configDir, name));
      out.push({ name, version: Number(m[1]), bytes: info.size, at: info.mtime.toISOString() });
    } catch {
      // gone meanwhile
    }
  }
  return out.sort((a, b) => b.version - a.version || a.name.localeCompare(b.name));
}

/**
 * The installation's town inside a backup copy, read only (every schema so far keeps `towns.document`): the document's
 * text and the revision it had, or null when the copy has no town for it. An unreadable copy is null too.
 */
export function readBackupTown(configDir: string, name: string, installation: string): { rev: number; document: string } | null {
  if (!BACKUP_NAME.test(name)) return null;
  const file = path.join(configDir, name);
  if (!existsSync(file)) return null;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const found = db.prepare("SELECT rev, document FROM towns WHERE installation = ?").get(installation) as { rev: number; document: string } | undefined;
    return found === undefined ? null : { rev: found.rev, document: found.document };
  } catch {
    return null;
  } finally {
    db?.close();
  }
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
  // A file held at an older schema (tests open one with fewer migrations) has no history column: the store then keeps
  // one entry per town, the document as it is, and every move still answers.
  const hasHistory = (db.prepare("PRAGMA table_info(towns)").all() as { name: string }[]).some((c) => c.name === "history");
  const select = db.prepare(`SELECT installation, rev, document, ${hasHistory ? "history" : "NULL AS history"}, updated_at AS updatedAt, updated_by AS updatedBy FROM towns WHERE installation = ?`);
  const insert = hasHistory
    ? db.prepare("INSERT INTO towns (installation, rev, document, history, updated_at, updated_by) VALUES (?, 1, ?, ?, ?, ?)")
    : db.prepare("INSERT INTO towns (installation, rev, document, updated_at, updated_by) VALUES (?, 1, ?, ?, ?)");
  const update = hasHistory
    ? db.prepare("UPDATE towns SET rev = rev + 1, document = ?, history = ?, updated_at = ?, updated_by = ? WHERE installation = ? AND rev = ?")
    : db.prepare("UPDATE towns SET rev = rev + 1, document = ?, updated_at = ?, updated_by = ? WHERE installation = ? AND rev = ?");
  const insertRow = (installation: string, document: string, history: string, at: string, updatedBy: string | null) =>
    hasHistory ? insert.run(installation, document, history, at, updatedBy) : insert.run(installation, document, at, updatedBy);
  const updateRow = (document: string, history: string, at: string, updatedBy: string | null, installation: string, baseRev: number) =>
    hasHistory ? update.run(document, history, at, updatedBy, installation, baseRev) : update.run(document, at, updatedBy, installation, baseRev);
  type Row = { installation: string; rev: number; document: string; history: string | null; updatedAt: string; updatedBy: string | null };
  /** The history of a row: the stored one, else one made of the document (a row from before schema 2). */
  const historyOf = (row: Row): TownHistory | null => {
    if (row.history !== null) {
      try {
        const parsed = JSON.parse(row.history) as TownHistory;
        if (Array.isArray(parsed.entries) && parsed.entries.length > 0 && Number.isInteger(parsed.index)) return parsed;
      } catch {
        // rebuilt below
      }
    }
    try {
      return createHistory(JSON.parse(row.document) as TownHistory["entries"][number]);
    } catch {
      return null;
    }
  };
  const store: WorldDb = {
    file,
    version,
    backups,
    getTown(installation) {
      const found = select.get(installation) as Row | undefined;
      if (found === undefined) return null;
      const history = historyOf(found);
      return { installation, rev: found.rev, document: found.document, updatedAt: found.updatedAt, updatedBy: found.updatedBy ?? null, canUndo: history !== null && canUndo(history), canRedo: history !== null && canRedo(history) };
    },
    putTown(installation, document, baseRev, updatedBy = null, now = () => new Date().toISOString()) {
      const outcome = store.applyTown(installation, { kind: "commit", document }, baseRev, updatedBy, now);
      return outcome.ok ? { ok: true, rev: outcome.rev } : outcome;
    },
    applyTown(installation, op, baseRev, updatedBy = null, now = () => new Date().toISOString()) {
      const at = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = select.get(installation) as Row | undefined;
        const current = row?.rev ?? 0;
        if (current !== baseRev) {
          db.exec("ROLLBACK");
          return { ok: false, conflict: { rev: current, document: row?.document ?? null } };
        }
        if (row === undefined) {
          if (op.kind !== "commit") {
            db.exec("ROLLBACK");
            return { ok: true, rev: 0, document: null, canUndo: false, canRedo: false, changed: false };
          }
          const history = createHistory(JSON.parse(op.document) as TownHistory["entries"][number]);
          insertRow(installation, op.document, JSON.stringify(history), at, updatedBy);
          db.exec("COMMIT");
          return { ok: true, rev: 1, document: op.document, canUndo: false, canRedo: false, changed: true };
        }
        const history = historyOf(row) ?? createHistory(JSON.parse(row.document) as TownHistory["entries"][number]);
        const moved =
          op.kind === "commit"
            ? commitHistory(history, JSON.parse(op.document) as TownHistory["entries"][number])
            : op.kind === "amend"
              ? amendHistory(history, JSON.parse(op.document) as TownHistory["entries"][number])
              : op.kind === "undo"
                ? undoHistory(history)
                : redoHistory(history);
        if (moved === history) {
          db.exec("ROLLBACK");
          return { ok: true, rev: current, document: row.document, canUndo: canUndo(history), canRedo: canRedo(history), changed: false };
        }
        const document = JSON.stringify(currentDocument(moved));
        updateRow(document, JSON.stringify(moved), at, updatedBy, installation, baseRev);
        db.exec("COMMIT");
        return { ok: true, rev: current + 1, document, canUndo: canUndo(moved), canRedo: canRedo(moved), changed: true };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
  return store;
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
