/**
 * The one list of crewhub-loops routes the host may call, and of the browser routes it answers under `/world-api`.
 * Every loops call the host makes goes through `allowedLoopsPath`; every browser request through `matchWorldRoute`.
 * Anything else is 404, every method a route does not name is 405 (GET unless `methods` says otherwise; only the
 * local `/connect` takes POST and DELETE, `/dev-origin` POST). Safe methods only towards loops: the host never writes to crewhub-loops.
 */

import { WORLD_API_PREFIX, WORLD_ROUTES, type WorldRoute, fillPattern, isSegment } from "@crewhub/loops-client";

// The browser routes, the prefix, the segment rule and the pattern filler are the wire's (`hostWire.ts` in loops-client,
// defined once for the host, the page and the stubs); named here too, so this one file still says everything the host
// answers and everything it may ask loops for.
export { WORLD_API_PREFIX, WORLD_ROUTES, type WorldRoute, fillPattern, isSegment };

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
  { pattern: "/api/events", query: ["after", "cursor", "from", "limit", "ticket", "types"] },
  { pattern: "/api/events/stream", query: ["after", "cursor"] },
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
  // The chat, where loops lets the world's key read it (a viewer key, round 12): the threads (the probe) and a message by id.
  { pattern: "/api/dm/threads", query: [] },
  { pattern: "/api/dm/messages/{id}", query: [] },
];

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
    if (!isSegment(part)) return null;
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
 * `query` entries not on the route's list are dropped. The path sent is the normalised one the list matched
 * (its segments, re-joined and encoded): a doubled or trailing slash is not passed on as it came (round 34).
 */
export function allowedLoopsPath(path: string, query: Record<string, string> = {}): string {
  const parts = segments(path);
  const read = parts === null ? undefined : LOOPS_READS.find((r) => matchPattern(r.pattern, path) !== null);
  if (read === undefined || parts === null) throw new Error(`loops path not on the allow-list: ${path}`);
  const search = new URLSearchParams();
  for (const name of read.query) {
    const value = query[name];
    if (value !== undefined) search.set(name, value);
  }
  const qs = search.toString();
  const canonical = `/${parts.map(encodeURIComponent).join("/")}`;
  return qs === "" ? canonical : `${canonical}?${qs}`;
}
