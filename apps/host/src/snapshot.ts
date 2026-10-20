/**
 * Assembles one `LoopsSnapshot` the way read-model.md "Loading a snapshot" says: the cursor first (the stream's
 * position, so no event between the reads and the stream is lost), then projects, boards, people, agents, team,
 * watchdog, and milestones and releases where the feature is on. Lists are paged (`nextCursor`): every page is read.
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

/** A read that must succeed: 401/403 is `unauthorized`, anything else that is not 200 is `loops_down`. */
async function must<T>(client: LoopsClient, path: string, query: Record<string, string> = {}): Promise<T> {
  const { status, body } = await client.getJson<T>(path, query);
  if (status === 200 && body !== null) return body;
  if (isUnauthorized(status)) throw new SnapshotError("unauthorized", `${path} answered ${status}`);
  throw new SnapshotError("loops_down", `${path} answered ${status}`);
}

/** Follows `nextCursor` until the last page; `pick` names the list in each page. */
async function allPages<T>(client: LoopsClient, path: string, pick: (page: Record<string, unknown>) => T[]): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 1000; guard += 1) {
    const query: Record<string, string> = cursor === null ? {} : { cursor };
    const page = await must<Record<string, unknown>>(client, path, query);
    out.push(...pick(page));
    const next = page.nextCursor;
    if (typeof next !== "string" || next === "") break;
    cursor = next;
  }
  return out;
}

/** Milestones or releases of a project: `[]` when the feature is off (409 `feature_off`). */
async function featured<T>(client: LoopsClient, path: string, pick: (page: Record<string, unknown>) => T[]): Promise<T[] | null> {
  const first = await client.getJson<Record<string, unknown>>(path);
  if (first.status === 409) return null;
  return allPages(client, path, pick);
}

/**
 * Reads the projects, with the archived ones when the key may see them (an agent key gets 403 for `includeArchived`;
 * then `complete` is false and the archived ones are found through the event log).
 */
async function readProjects(client: LoopsClient): Promise<{ projects: ProjectOut[]; complete: boolean }> {
  const withArchived = await client.getJson<{ projects: ProjectOut[] }>("/api/projects", { includeArchived: "true" });
  if (withArchived.status === 200 && withArchived.body !== null) return { projects: withArchived.body.projects, complete: true };
  if (withArchived.status === 401) throw new SnapshotError("unauthorized", "/api/projects answered 401");
  return { projects: (await must<{ projects: ProjectOut[] }>(client, "/api/projects")).projects, complete: false };
}

/** loops' page of `GET /api/events`: `limit` is 1..500, default 500 (`routers/events.py`); a full page may have more behind it. */
const EVENTS_PAGE = 500;
const ARCHIVE_TYPES = "project.archived,project.restored";

/**
 * Slugs of the projects archived now, learnt from the event log: an agent key may not list archived projects
 * (`includeArchived` is for human admins), but the log is never pruned, and the last of `project.archived` and
 * `project.restored` per slug says where it stands. Pages with `after=` (`lastSeq` is the last row returned, else
 * the `after` sent) until a page is short of loops' 500, or `lastSeq` stops moving.
 */
export async function archivedSlugsFromEvents(client: LoopsClient): Promise<string[]> {
  const last = new Map<string, string>();
  let after = 0;
  for (let guard = 0; guard < 1000; guard += 1) {
    const page = await must<{ events?: unknown; lastSeq?: unknown }>(client, "/api/events", { types: ARCHIVE_TYPES, after: String(after), limit: String(EVENTS_PAGE) });
    const events = Array.isArray(page.events) ? (page.events as { type?: unknown; project?: { slug?: unknown } | null }[]) : [];
    for (const event of events) {
      const slug = event.project?.slug;
      if (typeof slug !== "string" || typeof event.type !== "string") continue;
      last.set(slug, event.type);
    }
    const lastSeq = typeof page.lastSeq === "number" ? page.lastSeq : after;
    if (events.length < EVENTS_PAGE || lastSeq <= after) break;
    after = lastSeq;
  }
  return [...last.entries()].filter(([, type]) => type === "project.archived").map(([slug]) => slug);
}

export interface SnapshotOptions {
  /** The event cursor the snapshot is taken after (the host's stream position). */
  cursor: number;
  /** Slugs of projects the host saw archived through events: read one by one, since the list leaves them out. */
  knownArchivedSlugs?: Iterable<string>;
}

export async function assembleSnapshot(client: LoopsClient, options: SnapshotOptions): Promise<LoopsSnapshot> {
  const { projects: listed, complete } = await readProjects(client);
  const projects = listed.filter((p) => p.archivedAt === null || p.archivedAt === undefined);
  const archivedProjects = listed.filter((p) => typeof p.archivedAt === "string");
  const seen = new Set(listed.map((p) => p.slug));
  // Archived projects the list left out: the ones the log says are archived, and the ones the host's stream saw.
  const fromLog = complete ? [] : await archivedSlugsFromEvents(client);
  for (const slug of new Set([...fromLog, ...(options.knownArchivedSlugs ?? [])])) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    const one = await client.getJson<{ project: ProjectOut }>("/api/projects/{slug}".replace("{slug}", encodeURIComponent(slug)));
    if (one.status === 200 && one.body?.project !== undefined && typeof one.body.project.archivedAt === "string") {
      archivedProjects.push(one.body.project);
    }
  }

  const perProject = await Promise.all(
    projects.map(async (project) => {
      const slug = encodeURIComponent(project.slug);
      const [board, features] = await Promise.all([
        must<BoardResponse>(client, `/api/board/${slug}`),
        must<{ features: FeatureOut[] }>(client, `/api/projects/${slug}/features`),
      ]);
      const on = (key: string) => features.features.some((f) => f.key === key && f.value === true);
      const [milestones, releases] = await Promise.all([
        on("milestones") ? featured<MilestoneSummary>(client, `/api/projects/${slug}/milestones`, (p) => (p.milestones as MilestoneSummary[]) ?? []) : null,
        on("releases") ? featured<ReleaseSummary>(client, `/api/projects/${slug}/releases`, (p) => (p.releases as ReleaseSummary[]) ?? []) : null,
      ]);
      return { slug: project.slug, board, milestones, releases };
    }),
  );

  const [principals, agents, team, watchdog] = await Promise.all([
    must<{ principals: PrincipalOut[] }>(client, "/api/principals"),
    must<{ agents: AgentOut[] }>(client, "/api/agents"),
    must<TeamSnapshot>(client, "/api/team"),
    must<WatchdogResponse>(client, "/api/watchdog"),
  ]);

  const snapshot: LoopsSnapshot = {
    cursor: options.cursor,
    projects,
    archivedProjects,
    boards: Object.fromEntries(perProject.map((p) => [p.slug, p.board])),
    team,
    agents: agents.agents,
    principals: principals.principals,
    watchdog,
    milestones: Object.fromEntries(perProject.filter((p) => p.milestones !== null).map((p) => [p.slug, p.milestones as MilestoneSummary[]])),
    releases: Object.fromEntries(perProject.filter((p) => p.releases !== null).map((p) => [p.slug, p.releases as ReleaseSummary[]])),
    groups: [],
  };
  return snapshot;
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
