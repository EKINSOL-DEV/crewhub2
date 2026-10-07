/**
 * The one list of crewhub-loops routes the host may call, and of the browser routes it answers under `/world-api`.
 * Every loops call the host makes goes through `allowedLoopsPath`; every browser request through `matchWorldRoute`.
 * Anything else is 404, every method but GET is 405. Safe methods only: the host never writes to crewhub-loops.
 */

/** A path segment of a loops ref or slug: a ticket key (`CL-85`, `CL-111.2`), an id (`tk_…`), a slug. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Query parameters a browser may pass through, per route kind. */
const PAGE_QUERY = ["limit", "cursor"] as const;

export interface LoopsRead {
  /** The loops path, e.g. `/api/projects/{slug}/features`; `{x}` stands for one segment. */
  pattern: string;
  /** Query parameters the host may send. */
  query: readonly string[];
}

/** Routes the host reads from crewhub-loops (read-model.md "Loading a snapshot", events.md). */
export const LOOPS_READS: readonly LoopsRead[] = [
  { pattern: "/api/health", query: [] },
  { pattern: "/api/auth/me", query: [] },
  { pattern: "/api/events", query: ["after", "limit", "types"] },
  { pattern: "/api/events/stream", query: ["after"] },
  { pattern: "/api/projects", query: ["includeArchived"] },
  { pattern: "/api/projects/{slug}", query: [] },
  { pattern: "/api/projects/{slug}/features", query: [] },
  { pattern: "/api/projects/{slug}/milestones", query: PAGE_QUERY },
  { pattern: "/api/projects/{slug}/releases", query: PAGE_QUERY },
  { pattern: "/api/board/{slug}", query: [] },
  { pattern: "/api/tickets/{ref}", query: [] },
  { pattern: "/api/tickets/{ref}/comments", query: PAGE_QUERY },
  { pattern: "/api/tickets/{ref}/progress", query: PAGE_QUERY },
  { pattern: "/api/principals", query: [] },
  { pattern: "/api/agents", query: [] },
  { pattern: "/api/team", query: [] },
  { pattern: "/api/watchdog", query: [] },
];

export interface WorldRoute {
  /** The browser path under `/world-api`, e.g. `/tickets/{ref}`. */
  pattern: string;
  /** `local`: the host answers itself; `loops`: passed through to the loops path with the same segments. */
  kind: "local" | "loops";
  loopsPattern?: string;
  query: readonly string[];
}

/** Routes the browser may ask the host for (`/world-api` + pattern). */
export const WORLD_ROUTES: readonly WorldRoute[] = [
  { pattern: "/health", kind: "local", query: [] },
  { pattern: "/snapshot", kind: "local", query: [] },
  { pattern: "/stream", kind: "local", query: ["cursor"] },
  { pattern: "/project-groups", kind: "local", query: [] },
  { pattern: "/tickets/{ref}", kind: "loops", loopsPattern: "/api/tickets/{ref}", query: [] },
  { pattern: "/tickets/{ref}/comments", kind: "loops", loopsPattern: "/api/tickets/{ref}/comments", query: PAGE_QUERY },
  { pattern: "/tickets/{ref}/progress", kind: "loops", loopsPattern: "/api/tickets/{ref}/progress", query: PAGE_QUERY },
  { pattern: "/projects/{slug}", kind: "loops", loopsPattern: "/api/projects/{slug}", query: [] },
  { pattern: "/projects/{slug}/milestones", kind: "loops", loopsPattern: "/api/projects/{slug}/milestones", query: PAGE_QUERY },
  { pattern: "/projects/{slug}/releases", kind: "loops", loopsPattern: "/api/projects/{slug}/releases", query: PAGE_QUERY },
  { pattern: "/board/{slug}", kind: "loops", loopsPattern: "/api/board/{slug}", query: [] },
  { pattern: "/watchdog", kind: "loops", loopsPattern: "/api/watchdog", query: [] },
  { pattern: "/team", kind: "loops", loopsPattern: "/api/team", query: [] },
];

export const WORLD_API_PREFIX = "/world-api";

/** Splits a pathname into decoded segments; null when a segment is not a valid ref or slug. */
function segments(pathname: string): string[] | null {
  const parts = pathname.split("/").filter((p) => p !== "");
  const out: string[] = [];
  for (const raw of parts) {
    let part: string;
    try {
      part = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (!SEGMENT.test(part)) return null;
    out.push(part);
  }
  return out;
}

/** Matches `pathname` against `pattern`; the captured `{name}` segments, or null. */
function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const expected = pattern.split("/").filter((p) => p !== "");
  const actual = segments(pathname);
  if (actual === null || actual.length !== expected.length) return null;
  const captured: Record<string, string> = {};
  for (let i = 0; i < expected.length; i += 1) {
    const want = expected[i] as string;
    const have = actual[i] as string;
    if (want.startsWith("{")) captured[want.slice(1, -1)] = have;
    else if (want !== have) return null;
  }
  return captured;
}

/** Fills `{name}` segments of a pattern with encoded values. */
export function fillPattern(pattern: string, values: Record<string, string>): string {
  return pattern.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent(values[name] ?? ""));
}

export interface WorldMatch {
  route: WorldRoute;
  params: Record<string, string>;
  /** The query to pass on: only the parameters the route allows. */
  query: URLSearchParams;
}

/** The browser route for a request path (with `/world-api`), or null for anything not on the list. */
export function matchWorldRoute(pathname: string, search: URLSearchParams): WorldMatch | null {
  if (pathname !== WORLD_API_PREFIX && !pathname.startsWith(`${WORLD_API_PREFIX}/`)) return null;
  const rest = pathname.slice(WORLD_API_PREFIX.length) || "/";
  for (const route of WORLD_ROUTES) {
    const params = matchPattern(route.pattern, rest);
    if (params === null) continue;
    const query = new URLSearchParams();
    for (const name of route.query) {
      const value = search.get(name);
      if (value !== null) query.set(name, value);
    }
    return { route, params, query };
  }
  return null;
}

/**
 * Builds a loops URL the host may call, or throws: the one gate every upstream read goes through.
 * `query` entries not on the route's list are dropped.
 */
export function allowedLoopsPath(path: string, query: Record<string, string> = {}): string {
  const read = LOOPS_READS.find((r) => matchPattern(r.pattern, path) !== null);
  if (read === undefined) throw new Error(`loops path not on the allow-list: ${path}`);
  const search = new URLSearchParams();
  for (const name of read.query) {
    const value = query[name];
    if (value !== undefined) search.set(name, value);
  }
  const qs = search.toString();
  return qs === "" ? path : `${path}?${qs}`;
}
