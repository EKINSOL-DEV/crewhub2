/**
 * The host's memory of the closed buildings: `<configDir>/archived.json`, the slugs of the projects it learnt were
 * archived (from loops' event log or from the stream), so a loops whose log the host may not read from the start still
 * shows its closed buildings on the next start. The snapshot checks every remembered slug with loops
 * (`GET /api/projects/{slug}`, archived only when loops says so), so a wrong or stale entry costs one read and shows
 * nothing; a restored project leaves the file at the next save. Mode 0600 in the 0700 folder, written whole, never a
 * key. The host writes it only when the set changed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { writeWhole } from "./keyStore.ts";

export const ARCHIVE_MEMORY_NAME = "archived.json";

export interface ArchiveMemory {
  /** Sorted, unique. */
  slugs: string[];
  /** When the list was learnt or last changed, ISO 8601. */
  at: string;
  /** The loops it was learnt from (the URL or socket path), for the log and the doctor; never used to refuse the list. */
  target?: string;
}

export interface ArchiveStore {
  /** The file. For the log. */
  file: string;
  /** The memory, or null when there is none or it is unreadable. */
  read(): ArchiveMemory | null;
  save(memory: ArchiveMemory): void;
}

/** `slugs` as the file keeps them: unique, sorted, strings only. */
export const normaliseSlugs = (slugs: Iterable<string>): string[] => [...new Set([...slugs].filter((s) => typeof s === "string" && s !== ""))].sort();

/** The file's JSON as a memory, or null when it is not one. */
export function parseArchiveMemory(text: string): ArchiveMemory | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as { v?: unknown; slugs?: unknown; at?: unknown; target?: unknown };
  if (record.v !== 1 || !Array.isArray(record.slugs)) return null;
  const out: ArchiveMemory = { slugs: normaliseSlugs(record.slugs.filter((s): s is string => typeof s === "string")), at: typeof record.at === "string" ? record.at : "" };
  if (typeof record.target === "string") out.target = record.target;
  return out;
}

export function createArchiveStore(configDir: string): ArchiveStore {
  const file = path.join(configDir, ARCHIVE_MEMORY_NAME);
  return {
    file,
    read() {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        return null;
      }
      return parseArchiveMemory(text);
    },
    save(memory) {
      const body = { v: 1, slugs: normaliseSlugs(memory.slugs), at: memory.at, ...(memory.target === undefined ? {} : { target: memory.target }) };
      writeWhole(configDir, file, `${JSON.stringify(body, null, 2)}\n`);
    },
  };
}
