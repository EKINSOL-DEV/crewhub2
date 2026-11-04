/**
 * The wire between the world's host (`apps/host`) and the page, defined once: the browser routes under `/world-api`,
 * the health answer, and the kinds of message the host's stream carries, each with its reader. The host writes through
 * this module (its route table and its health and message types are these); the page's live source
 * (`hostSource.ts`) and the stubs that stand in for a host (the tests' hand hosts, `tools/lib/connectStub.mjs`) read
 * through it, so one table and one set of readers pin the contract (`apps/host/test/wire.test.ts` runs the real host
 * and the stubs against them). Pure: no fetch, no node, no DOM.
 */

// --- Routes. ---

export const WORLD_API_PREFIX = "/world-api";

/** A path segment of a loops ref or slug: a ticket key (`CL-85`, `CL-111.2`), an id (`tk_…`), a slug. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** Whether a string is one path segment of a loops ref or slug (the shape every remembered slug must have, review F8). */
export const isSegment = (value: unknown): value is string => typeof value === "string" && SEGMENT.test(value);

/** Query parameters a browser may pass through, per route kind. */
const PAGE_QUERY = ["limit", "cursor"] as const;

export interface WorldRoute {
  /** The browser path under `/world-api`, e.g. `/tickets/{ref}`; `{x}` stands for one segment. */
  pattern: string;
  /** `local`: the host answers itself; `loops`: passed through to the loops path with the same segments. */
  kind: "local" | "loops";
  loopsPattern?: string;
  /** Query parameters the host passes on; any other is dropped. */
  query: readonly string[];
  /** The methods the route answers; GET when absent. Only `/connect` and `/town` take a write, both local; the key never writes to loops, the town is the host's own database (worldDb.ts). The sign-in road's `/session` went in round 19. */
  methods?: readonly string[];
}

/**
 * Routes the browser may ask the host for (`/world-api` + pattern): the host matches against this table
 * (`allowList.ts`), the page builds its paths from it (`worldApiPath`), the stubs answer by it.
 */
const ROUTES = [
  { pattern: "/health", kind: "local", query: [] },
  { pattern: "/snapshot", kind: "local", query: [] },
  { pattern: "/stream", kind: "local", query: ["cursor"] },
  { pattern: "/project-groups", kind: "local", query: [] },
  { pattern: "/connect", kind: "local", query: [], methods: ["POST", "DELETE"] },
  // The dev server of this checkout tells the host its loopback origin (devOrigin.ts); a program's request, never a page's.
  { pattern: "/dev-origin", kind: "local", query: [], methods: ["POST"] },
  { pattern: "/town", kind: "local", query: [], methods: ["GET", "PUT"] },
  { pattern: "/town/export", kind: "local", query: [] },
  { pattern: "/town/backups", kind: "local", query: [] },
  { pattern: "/town/backups/{name}", kind: "local", query: [] },
  { pattern: "/tickets/{ref}", kind: "loops", loopsPattern: "/api/tickets/{ref}", query: [] },
  { pattern: "/tickets/{ref}/comments", kind: "loops", loopsPattern: "/api/tickets/{ref}/comments", query: PAGE_QUERY },
  { pattern: "/tickets/{ref}/progress", kind: "loops", loopsPattern: "/api/tickets/{ref}/progress", query: PAGE_QUERY },
  { pattern: "/projects/{slug}", kind: "loops", loopsPattern: "/api/projects/{slug}", query: [] },
  { pattern: "/projects/{slug}/milestones", kind: "loops", loopsPattern: "/api/projects/{slug}/milestones", query: PAGE_QUERY },
  { pattern: "/projects/{slug}/releases", kind: "loops", loopsPattern: "/api/projects/{slug}/releases", query: PAGE_QUERY },
  { pattern: "/board/{slug}", kind: "loops", loopsPattern: "/api/board/{slug}", query: [] },
  { pattern: "/watchdog", kind: "loops", loopsPattern: "/api/watchdog", query: [] },
  { pattern: "/team", kind: "loops", loopsPattern: "/api/team", query: [] },
] as const satisfies readonly WorldRoute[];
export const WORLD_ROUTES: readonly WorldRoute[] = ROUTES;

/** A pattern of the table: the only paths the page may build (`worldApiPath`), checked by `npm run typecheck`. */
export type WorldRoutePattern = (typeof ROUTES)[number]["pattern"];

/** Fills `{name}` segments of a pattern with encoded values. */
export function fillPattern(pattern: string, values: Record<string, string>): string {
  return pattern.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent(values[name] ?? ""));
}

/**
 * The path the page asks its host for: `/world-api` + the pattern with its segments filled and encoded, and the query
 * the route takes. A query parameter the route does not pass on is the page's own error, thrown here (the host would
 * drop it silently and answer something else than the page meant).
 */
export function worldApiPath(pattern: WorldRoutePattern, params: Record<string, string> = {}, query: Record<string, string> = {}): string {
  const route = WORLD_ROUTES.find((r) => r.pattern === pattern) as WorldRoute;
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (!route.query.includes(name)) throw new Error(`${WORLD_API_PREFIX}${pattern} takes no query parameter ${name}`);
    search.set(name, value);
  }
  const qs = search.toString();
  return `${WORLD_API_PREFIX}${fillPattern(pattern, params)}${qs === "" ? "" : `?${qs}`}`;
}
