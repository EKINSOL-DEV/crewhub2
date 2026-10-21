/**
 * Assembles one `LoopsSnapshot` the way read-model.md "Loading a snapshot" says: the cursor first (the stream's
 * position, so no event between the reads and the stream is lost), then projects, boards, people, agents, team,
 * watchdog, and milestones and releases where the feature is on. Lists are paged (`nextCursor`): every page is read.
 * The reads of one snapshot run in parallel under a cap (`concurrency`, default 6: loops is one process, and a studio
 * of twenty projects is forty board and feature reads), in the projects' order; every read is timed and counted, so
 * the host can say "5 projects, 31 reads in 118 ms" and show the page how far it is (`onProgress`).
 */
import type {
  AgentOut,
  BoardResponse,
  LoopsSnapshot,
  MilestoneSummary,
  PrincipalOut,
  ProjectOut,
  ReleaseSummary,
  TeamSnapshot,
  WatchdogResponse,
} from "@crewhub/loops-client";
import { type LoopsClient, isUnauthorized } from "./loops.ts";

export class SnapshotError extends Error {
  readonly reason: "loops_down" | "unauthorized";
  constructor(reason: "loops_down" | "unauthorized", message: string) {
    super(message);
    this.reason = reason;
  }
}

interface FeatureOut {
  key: string;
  value: unknown;
}

/** One read of loops during the assembly: the path and how long it took. */
export interface SnapshotRead {
  path: string;
  ms: number;
  status: number;
}

/** How far an assembly is: known once the project list is in. */
export interface SnapshotProgress {
  /** Active projects to read, once the list is in; null before. */
  projects: number | null;
  /** Reads finished so far. */
  reads: number;
}

export const DEFAULT_CONCURRENCY = 6;

/**
 * `Promise.all(items.map(fn))` under a cap: never more than `limit` calls of `fn` in flight, started in the items'
 * order, the results in the items' order. The first rejection rejects the whole (the rest finish on their own).
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const cap = Math.max(1, Math.floor(limit));
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(cap, items.length) }, () => worker()));
  return results;
}

/** The client with the reads counted and timed. */
interface Reader {
  getJson<T>(path: string, query?: Record<string, string>): Promise<{ status: number; body: T | null }>;
}

function timed(client: LoopsClient, onRead: (read: SnapshotRead) => void): Reader {
  return {
    async getJson<T>(path: string, query: Record<string, string> = {}) {
      const started = performance.now();
      const out = await client.getJson<T>(path, query);
      onRead({ path, ms: performance.now() - started, status: out.status });
      return out;
    },
  };
}

/** A read that must succeed: 401/403 is `unauthorized`, anything else that is not 200 is `loops_down`. */
async function must<T>(client: Reader, path: string, query: Record<string, string> = {}): Promise<T> {
  const { status, body } = await client.getJson<T>(path, query);
  if (status === 200 && body !== null) return body;
  if (isUnauthorized(status)) throw new SnapshotError("unauthorized", `${path} answered ${status}`);
  throw new SnapshotError("loops_down", `${path} answered ${status}`);
}

/** Follows `nextCursor` until the last page; `pick` names the list in each page. `first` is the first page when it was read already. */
async function allPages<T>(client: Reader, path: string, pick: (page: Record<string, unknown>) => T[], first: Record<string, unknown> | null = null): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 1000; guard += 1) {
    const query: Record<string, string> = cursor === null ? {} : { cursor };
    const page = guard === 0 && first !== null ? first : await must<Record<string, unknown>>(client, path, query);
    out.push(...pick(page));
    const next = page.nextCursor;
    if (typeof next !== "string" || next === "") break;
    cursor = next;
  }
  return out;
}

/** Milestones or releases of a project: `[]` when the feature is off (409 `feature_off`). */
async function featured<T>(client: Reader, path: string, pick: (page: Record<string, unknown>) => T[]): Promise<T[] | null> {
  const first = await client.getJson<Record<string, unknown>>(path);
  if (first.status === 409) return null;
  if (first.status !== 200 || first.body === null) {
    if (isUnauthorized(first.status)) throw new SnapshotError("unauthorized", `${path} answered ${first.status}`);
    throw new SnapshotError("loops_down", `${path} answered ${first.status}`);
  }
  return allPages(client, path, pick, first.body);
}

/**
 * Reads the projects, with the archived ones when the key may see them (an agent key gets 403 for `includeArchived`;
 * then `complete` is false and the archived ones are found through the event log).
 */
async function readProjects(client: Reader): Promise<{ projects: ProjectOut[]; complete: boolean }> {
  const withArchived = await client.getJson<{ projects: ProjectOut[] }>("/api/projects", { includeArchived: "true" });
  if (withArchived.status === 200 && withArchived.body !== null) return { projects: withArchived.body.projects, complete: true };
  if (withArchived.status === 401) throw new SnapshotError("unauthorized", "/api/projects answered 401");
  return { projects: (await must<{ projects: ProjectOut[] }>(client, "/api/projects")).projects, complete: false };
}

/** loops' page of `GET /api/events`: `limit` is 1..500, default 500 (`routers/events.py`); a full page may have more behind it. */
const EVENTS_PAGE = 500;
const ARCHIVE_TYPES = "project.archived,project.restored";

/** What the log read found: the slugs archived now, and whether the whole log was read (else the host's memory matters). */
export interface ArchiveLogRead {
  slugs: string[];
  /** True when every page answered 200 up to the end; false when loops would not read its log (a 410 or another answer). */
  complete: boolean;
}

/**
 * Slugs of the projects archived now, learnt from the event log: an agent key may not list archived projects
 * (`includeArchived` is for human admins), but the log is never pruned, and the last of `project.archived` and
 * `project.restored` per slug says where it stands. Pages with `after=` (`lastSeq` is the last row returned, else
 * the `after` sent) until a page is short of loops' 500, or `lastSeq` stops moving. Best effort: a refused key is
 * `unauthorized`, but any other answer than 200 (a loops that will not read its log from `after=0`, as the fake
 * answers 410 after a restart) ends the search with what it found and `complete: false`; the stream's own archive
 * events and the host's memory of an earlier run still count.
 */
export async function readArchivedSlugsFromEvents(client: Reader): Promise<ArchiveLogRead> {
  const last = new Map<string, string>();
  let after = 0;
  let complete = false;
  for (let guard = 0; guard < 1000; guard += 1) {
    const { status, body: page } = await client.getJson<{ events?: unknown; lastSeq?: unknown }>("/api/events", { types: ARCHIVE_TYPES, after: String(after), limit: String(EVENTS_PAGE) });
    if (isUnauthorized(status)) throw new SnapshotError("unauthorized", `/api/events answered ${status}`);
    if (status !== 200 || page === null) break;
    const events = Array.isArray(page.events) ? (page.events as { type?: unknown; project?: { slug?: unknown } | null }[]) : [];
    for (const event of events) {
      const slug = event.project?.slug;
      if (typeof slug !== "string" || typeof event.type !== "string") continue;
      last.set(slug, event.type);
    }
    const lastSeq = typeof page.lastSeq === "number" ? page.lastSeq : after;
    if (events.length < EVENTS_PAGE || lastSeq <= after) {
      complete = true;
      break;
    }
    after = lastSeq;
  }
  return { slugs: [...last.entries()].filter(([, type]) => type === "project.archived").map(([slug]) => slug), complete };
}

/** The slugs alone (the callers from before the archive memory). */
export async function archivedSlugsFromEvents(client: LoopsClient): Promise<string[]> {
  return (await readArchivedSlugsFromEvents(client)).slugs;
}

/** Where a snapshot's archived projects came from, for the host's memory and the Connection panel. */
export interface ArchiveReport {
  /** `list`: loops listed them; `log`: the event log, read whole; `remembered`: the log could not be read whole and the host's memory filled in; `none`: nothing known. */
  source: "list" | "log" | "remembered" | "none";
  /** The slugs loops confirmed archived now (the list, or `GET /api/projects/{slug}` with `archivedAt`). */
  slugs: string[];
}

export interface SnapshotOptions {
  /** The event cursor the snapshot is taken after (the host's stream position). */
  cursor: number;
  /** Slugs of projects the host saw archived through events: read one by one, since the list leaves them out. */
  knownArchivedSlugs?: Iterable<string>;
  /** Slugs the host remembered from an earlier run (`archiveStore.ts`): read one by one too, and confirmed by loops. */
  rememberedSlugs?: Iterable<string>;
  /** The host's own principal (the key's agent, as loops named it): the observer the world hides from the figures. */
  observer?: string | null;
  /** Told where the archived projects came from, once per snapshot. */
  onArchive?: (report: ArchiveReport) => void;
  /** Reads in flight at most (default 6). */
  concurrency?: number;
  /** Every read as it finishes, with its time. */
  onRead?: (read: SnapshotRead) => void;
  /** How far the assembly is, after the project list and after every read. */
  onProgress?: (progress: SnapshotProgress) => void;
}

/** What one assembly cost: for the step line and the health's `snapshot`. */
export interface SnapshotStats {
  projects: number;
  reads: number;
  ms: number;
  /** The slowest read, when there was one. */
  slowest: SnapshotRead | null;
}

export interface AssembledSnapshot {
  snapshot: LoopsSnapshot;
  stats: SnapshotStats;
}

export async function assembleSnapshot(client: LoopsClient, options: SnapshotOptions): Promise<AssembledSnapshot> {
  const started = performance.now();
  const progress: SnapshotProgress = { projects: null, reads: 0 };
  let slowest: SnapshotRead | null = null;
  const reader = timed(client, (read) => {
    progress.reads += 1;
    if (slowest === null || read.ms > slowest.ms) slowest = read;
    options.onRead?.(read);
    options.onProgress?.({ ...progress });
  });
  const limit = options.concurrency ?? DEFAULT_CONCURRENCY;

  const { projects: listed, complete } = await readProjects(reader);
  const projects = listed.filter((p) => p.archivedAt === null || p.archivedAt === undefined);
  const archivedProjects = listed.filter((p) => typeof p.archivedAt === "string");
  progress.projects = projects.length;
  options.onProgress?.({ ...progress });
  const seen = new Set(listed.map((p) => p.slug));
  // Archived projects the list left out: the ones the log says are archived, the ones the host's stream saw, and the
  // ones the host remembered (they matter when loops would not read its log whole); read one by one under the same
  // cap, in order, counted and timed like every other read.
  const fromLog: ArchiveLogRead = complete ? { slugs: [], complete: true } : await readArchivedSlugsFromEvents(reader);
  const remembered = [...(options.rememberedSlugs ?? [])];
  const unseen = [...new Set([...fromLog.slugs, ...(options.knownArchivedSlugs ?? []), ...remembered])].filter((slug) => !seen.has(slug));
  const ones = await mapLimit(unseen, limit, (slug) => reader.getJson<{ project: ProjectOut }>("/api/projects/{slug}".replace("{slug}", encodeURIComponent(slug))));
  for (const one of ones) {
    if (one.status === 200 && one.body?.project !== undefined && typeof one.body.project.archivedAt === "string") archivedProjects.push(one.body.project);
  }
  options.onArchive?.({ source: complete ? "list" : fromLog.complete ? "log" : remembered.length > 0 ? "remembered" : "none", slugs: archivedProjects.map((p) => p.slug).sort() });

  // The reads of every project, flattened into one capped queue in the projects' order: the board and the features of
  // every project first (two reads each), then the milestones and releases of those that have the feature on.
  type Read = () => Promise<unknown>;
  const firsts = await mapLimit(
    projects.flatMap((project): Read[] => {
      const slug = encodeURIComponent(project.slug);
      return [() => must<BoardResponse>(reader, `/api/board/${slug}`), () => must<{ features: FeatureOut[] }>(reader, `/api/projects/${slug}/features`)];
    }),
    limit,
    (read) => read(),
  );
  const seconds = await mapLimit(
    projects.flatMap((project, index): Read[] => {
      const slug = encodeURIComponent(project.slug);
      const features = (firsts[index * 2 + 1] as { features: FeatureOut[] }).features;
      const on = (key: string) => features.some((f) => f.key === key && f.value === true);
      return [
        on("milestones") ? () => featured<MilestoneSummary>(reader, `/api/projects/${slug}/milestones`, (p) => (p.milestones as MilestoneSummary[]) ?? []) : () => Promise.resolve(null),
        on("releases") ? () => featured<ReleaseSummary>(reader, `/api/projects/${slug}/releases`, (p) => (p.releases as ReleaseSummary[]) ?? []) : () => Promise.resolve(null),
      ];
    }),
    limit,
    (read) => read(),
  );
  const perProject = projects.map((project, index) => ({
    slug: project.slug,
    board: firsts[index * 2] as BoardResponse,
    milestones: seconds[index * 2] as MilestoneSummary[] | null,
    releases: seconds[index * 2 + 1] as ReleaseSummary[] | null,
  }));

  const [principals, agents, team, watchdog] = await Promise.all([
    must<{ principals: PrincipalOut[] }>(reader, "/api/principals"),
    must<{ agents: AgentOut[] }>(reader, "/api/agents"),
    must<TeamSnapshot>(reader, "/api/team"),
    must<WatchdogResponse>(reader, "/api/watchdog"),
  ]);

  const snapshot: LoopsSnapshot = {
    cursor: options.cursor,
    projects,
    archivedProjects,
    boards: Object.fromEntries(perProject.map((p) => [p.slug, p.board])),
    team,
    agents: agents.agents,
    observer: options.observer ?? null,
    principals: principals.principals,
    watchdog,
    milestones: Object.fromEntries(perProject.filter((p) => p.milestones !== null).map((p) => [p.slug, p.milestones as MilestoneSummary[]])),
    releases: Object.fromEntries(perProject.filter((p) => p.releases !== null).map((p) => [p.slug, p.releases as ReleaseSummary[]])),
    groups: [],
  };
  return { snapshot, stats: { projects: projects.length, reads: progress.reads, ms: performance.now() - started, slowest } };
}

/** Where the event log stands for this key: `lastSeq` (the newest event it may see) and, since CL-406, a sealed cursor for "now". */
export interface LogTail {
  lastSeq: number;
  /** The opaque token `GET /api/events?from=tail` gave; null from an older loops. */
  cursor: string | null;
}

/**
 * The tail of the event log (events.md "How to resume", step 1): `GET /api/events?from=tail` answers "now" for this
 * caller with no events. An older loops without `from=tail` ignores the parameter and answers a page of events
 * instead; then the old recipe (a filter that matches nothing) is read, whose `lastSeq` is honest on that loops.
 */
export async function readTail(client: LoopsClient): Promise<LogTail> {
  const tail = await must<{ events?: unknown; lastSeq?: unknown; cursor?: unknown }>(client, "/api/events", { from: "tail" });
  if (Array.isArray(tail.events) && tail.events.length === 0 && typeof tail.lastSeq === "number") {
    return { lastSeq: tail.lastSeq, cursor: typeof tail.cursor === "string" && tail.cursor !== "" ? tail.cursor : null };
  }
  const older = await must<{ lastSeq?: unknown }>(client, "/api/events", { types: "attachment.added", limit: "1" });
  if (typeof older.lastSeq !== "number") throw new SnapshotError("loops_down", "/api/events answered without lastSeq");
  return { lastSeq: older.lastSeq, cursor: null };
}
