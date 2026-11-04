/**
 * The host's memory of the closed buildings, as one module (round 59d, C5): it takes the facts (the loops found on
 * each link, the stream's `project.archived`/`project.restored`, a snapshot's archive report), answers the set with
 * its source and time, and owns writing it through an `ArchiveStore` (`archiveStore.ts`: the file `archived.json`
 * beside the key; no store: this run only). The doctor asks it whether a memory on disk belongs to the loops found
 * (`belongsTo`).
 *
 * The memory on disk belongs to one loops (round 34): the file names the target it was learnt from, and the memory
 * uses it only once a link finds that same target (a file without a target is the old format and is taken as is).
 * Another loops' memory is said and ignored, and it stays on disk until this loops' own set is learnt: a snapshot whose
 * archived set loops told whole (the list, or the whole log) or an archive event on the stream. A run that found
 * nothing never writes an empty list over it. The file as it stands is kept current by every save (round 47, the
 * review's F1), so a target found again judges the file as it is now, not as it was when the host started.
 *
 * Beside the set, each link keeps the slugs archived over its own stream (`seen`): a snapshot reads them one by one
 * whatever the set says since (they used to be the upstream's own `archivedSlugs()`).
 */
import type { HostArchiveState } from "@crewhub/loops-client";
import { isSegment } from "./allowList.ts";
import { type ArchiveRecord, type ArchiveStore, normaliseSlugs, plainTime } from "./archiveStore.ts";
import type { ArchiveReport } from "./snapshot.ts";

export interface ArchiveMemoryOptions {
  /** Where the memory lives across runs; absent: remembered for this run only (nothing read, nothing written). */
  store?: ArchiveStore;
  /** The target (`targetText`) discovery finds at the moment of a save, or null: the target the saved file names. */
  targetNow: () => string | null;
  log: (line: string) => void;
  /** The time a change is learnt at, ISO 8601. Default: now. */
  now?: () => string;
}

export interface ArchiveMemory {
  /**
   * A new link to the loops at `target` (every relink that found one, before its stream starts): the link's own
   * stream set starts empty, and a target other than the last one judges the memory on disk again (the set empties
   * first: nothing learnt from another loops holds for this one).
   */
  linked(target: string): void;
  /** An event with a project on the link's stream: `project.archived` adds the slug, `project.restored` takes it back. */
  heard(type: string, slug: unknown): void;
  /** A snapshot's report: the archived set loops confirmed, and where it came from. */
  reported(report: ArchiveReport): void;
  /**
   * The slugs archived over this link's stream, path segments only. Live: a snapshot under way reads it when it gets
   * to the archived projects.
   */
  seen(): ReadonlySet<string>;
  /** The set as it stands. A change makes a new set, so a snapshot keeps the one it started with. */
  slugs(): ReadonlySet<string>;
  /** Health's `connection.archived`; the slugs, sorted, only when `detailed` (a paired browser). */
  state(detailed: boolean): HostArchiveState;
}

/** Whether a memory on disk belongs to the loops at `target`: it names that target, or none (the format before round 34). */
export const belongsTo = (record: ArchiveRecord, target: string): boolean => record.target === undefined || record.target === target;

const projects = (n: number) => `${n} archived project${n === 1 ? "" : "s"}`;

export function createArchiveMemory(options: ArchiveMemoryOptions): ArchiveMemory {
  const { store, log } = options;
  const now = options.now ?? (() => new Date().toISOString());
  /** The file as it stands: read at the start, kept current by every save. */
  let onDisk = store?.read() ?? null;
  let source: HostArchiveState["source"] = "none";
  let slugs: ReadonlySet<string> = new Set();
  let at: string | undefined;
  let seen = new Set<string>();
  /** The target the memory was judged for, so a target change judges it again. */
  let judgedFor: string | null = null;
  /** True once this loops told the host its own set, or the memory on disk is this loops' own: then the file is written. */
  let learnt = false;

  /** Keeps the set (and its source), and writes the file only when the set changed and this loops' set is learnt. */
  function remember(next: Iterable<string>, from: HostArchiveState["source"] | null): void {
    const sorted = normaliseSlugs(next);
    const changed = sorted.join("\n") !== normaliseSlugs(slugs).join("\n");
    slugs = new Set(sorted);
    if (from !== null) source = from;
    if (from === "list" || from === "log") learnt = true;
    if (!changed && at !== undefined) return;
    at = now();
    if (store === undefined || !learnt) return;
    try {
      const target = options.targetNow();
      const record: ArchiveRecord = { slugs: sorted, at, ...(target === null ? {} : { target }) };
      store.save(record);
      onDisk = record;
      log(`remembered ${projects(sorted.length)} in ${store.file}`);
    } catch (error) {
      log(`cannot write the archive memory ${store.file}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return {
    linked(target) {
      seen = new Set();
      if (judgedFor === target) return;
      judgedFor = target;
      learnt = false;
      source = "none";
      slugs = new Set();
      at = undefined;
      if (onDisk === null) return;
      if (!belongsTo(onDisk, target)) {
        log(`${store?.file} remembers ${onDisk.target}, not ${target}: ignored (kept until this crewhub-loops' own archived projects are learnt)`);
        return;
      }
      learnt = true;
      slugs = new Set(onDisk.slugs);
      source = "remembered";
      at = onDisk.at;
      log(`remembered ${projects(onDisk.slugs.length)} from ${store?.file} (learnt ${onDisk.at === "" ? "at an unknown time" : plainTime(onDisk.at)}${onDisk.target === undefined ? ", from an unnamed crewhub-loops" : ""})`);
    },
    heard(type, slug) {
      // The link's own set keeps a slug only when it is one (round 34): a slug that is no segment would make every
      // snapshot fail on its read (`/api/projects/{slug}` refused by the allow-list, review F8), and `project` may be
      // anything on the wire. The set itself filters the same way (`normaliseSlugs`).
      if (type === "project.archived") {
        if (isSegment(slug)) seen.add(slug);
        learnt = true; // loops itself says this project is archived: a fact of this loops' own set
        remember([...slugs, slug as string], null);
      } else if (type === "project.restored") {
        if (isSegment(slug)) seen.delete(slug);
        remember([...slugs].filter((s) => s !== slug), null);
      }
    },
    reported(report) {
      remember(report.slugs, report.source);
    },
    seen: () => seen,
    slugs: () => slugs,
    state(detailed) {
      const out: HostArchiveState = { source, count: slugs.size, ...(at === undefined ? {} : { at }) };
      if (detailed) out.slugs = normaliseSlugs(slugs);
      return out;
    },
  };
}
