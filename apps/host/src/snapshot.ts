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

/** Reads the projects, with the archived ones when the key may see them (an agent key gets 403 for `includeArchived`). */
async function readProjects(client: LoopsClient): Promise<ProjectOut[]> {
  const withArchived = await client.getJson<{ projects: ProjectOut[] }>("/api/projects", { includeArchived: "true" });
  if (withArchived.status === 200 && withArchived.body !== null) return withArchived.body.projects;
  if (withArchived.status === 401) throw new SnapshotError("unauthorized", "/api/projects answered 401");
  return (await must<{ projects: ProjectOut[] }>(client, "/api/projects")).projects;
}

export interface SnapshotOptions {
  /** The event cursor the snapshot is taken after (the host's stream position). */
  cursor: number;
  /** Slugs of projects the host saw archived through events: read one by one, since the list leaves them out. */
  knownArchivedSlugs?: Iterable<string>;
}

export async function assembleSnapshot(client: LoopsClient, options: SnapshotOptions): Promise<LoopsSnapshot> {
  const listed = await readProjects(client);
  const projects = listed.filter((p) => p.archivedAt === null || p.archivedAt === undefined);
  const archivedProjects = listed.filter((p) => typeof p.archivedAt === "string");
  const seen = new Set(listed.map((p) => p.slug));
  for (const slug of options.knownArchivedSlugs ?? []) {
    if (seen.has(slug)) continue;
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

/** The tail of the event log (events.md "How to resume", step 1): a filter that matches nothing answers `lastSeq`. */
export async function readTail(client: LoopsClient): Promise<number> {
  const { lastSeq } = await must<{ lastSeq: number }>(client, "/api/events", { types: "attachment.added", limit: "1" });
  if (typeof lastSeq !== "number") throw new SnapshotError("loops_down", "/api/events answered without lastSeq");
  return lastSeq;
}
