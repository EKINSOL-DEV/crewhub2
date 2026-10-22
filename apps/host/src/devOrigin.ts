/*
 * The dev origin (round 23): `npm run dev` beside `npm run host` out of the box. The page runs on Vite's origin
 * (`http://127.0.0.1:5173`), Vite proxies `/world-api` to the host, and the host's origin guard refused that origin for
 * the page's writes (connect, sign-in, the town) unless CREWHUB_WORLD_ALLOWED_ORIGINS named it. Now the dev server
 * tells the host its origin once it listens (`POST /world-api/dev-origin {origin, checkout}`), and the host accepts
 * that one origin for this run. The decision is pure and narrow, and never a wildcard:
 *   - the request must come from a program on this machine, not a page: over loopback, with no `Origin` header (a
 *     browser always sends one on a POST) and a JSON content type (a page could not send it cross-origin without a
 *     preflight the host never answers);
 *   - the origin told must be a loopback http origin with a port (`http://127.0.0.1:<port>` or `localhost`, the two
 *     names the host answers to): never another host name, never https, never a wildcard;
 *   - the dev server must be this checkout's: the body carries the checkout id (`checkout.ts`, the same hash the host
 *     puts in health), and a host that knows its own id refuses another (a host without one, as in tests, cannot tell
 *     and accepts a loopback origin).
 * At most DEV_ORIGIN_MAX origins a run; telling the same origin again is fine and silent. Health lists them
 * (`devOrigins`, and the `x-world-dev-origins` header the dev proxy reads to tell again after a host restart).
 * Pairing is untouched: the dev origin only passes the origin guard; the page still needs its pairing cookie.
 */

export const DEV_ORIGIN_MAX = 8;
export const DEV_ORIGINS_HEADER = "x-world-dev-origins";

export type DevOriginVerdict = { ok: true; origin: string } | { ok: false; status: number; error: string; message: string };

/** `http://127.0.0.1:5294` or `http://localhost:5294` (the two names the host itself answers to), normalised; else null. */
export function loopbackOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^http:\/\/(127\.0\.0\.1|localhost):(\d{1,5})$/i.exec(value.trim());
  if (m === null) return null;
  const port = Number(m[2]);
  if (port < 1 || port > 65535) return null;
  return (m[1] as string).toLowerCase() === "localhost" ? `http://localhost:${port}` : `http://127.0.0.1:${port}`;
}

/** Whether a socket address is this machine's loopback. */
export function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/** The decision on one `POST /world-api/dev-origin`. */
export function devOriginVerdict(input: {
  body: unknown;
  originHeader: string | undefined;
  contentType: string | undefined;
  remoteAddress: string | undefined;
  hostCheckout: string | undefined;
  known: ReadonlySet<string>;
}): DevOriginVerdict {
  if (!isLoopbackAddress(input.remoteAddress)) return { ok: false, status: 403, error: "not_loopback", message: "The dev origin is told from a program on this machine only" };
  if (input.originHeader !== undefined) return { ok: false, status: 403, error: "not_a_program", message: "A page cannot tell the host its origin: this is for this checkout's dev server (npm run dev)" };
  if (!/^application\/json\b/i.test(input.contentType ?? "")) return { ok: false, status: 415, error: "json_required", message: "Send application/json" };
  if (input.body === null || typeof input.body !== "object") return { ok: false, status: 400, error: "bad_body", message: "Send {origin, checkout}" };
  const body = input.body as Record<string, unknown>;
  const origin = loopbackOrigin(body["origin"]);
  if (origin === null) return { ok: false, status: 400, error: "origin_not_loopback", message: "The dev origin must be http://127.0.0.1:<port> or http://localhost:<port>; never another host, https or a wildcard" };
  if (input.hostCheckout !== undefined && body["checkout"] !== input.hostCheckout) {
    return { ok: false, status: 403, error: "other_checkout", message: `This host runs from checkout ${input.hostCheckout}; only that checkout's dev server may tell it an origin` };
  }
  if (!input.known.has(origin) && input.known.size >= DEV_ORIGIN_MAX) return { ok: false, status: 429, error: "too_many_origins", message: `At most ${DEV_ORIGIN_MAX} dev origins a run; restart the host` };
  return { ok: true, origin };
}

/** The host's one line when it accepts a dev origin. */
export const devOriginAcceptedLine = (origin: string): string => `dev origin ${origin} accepted: this checkout's dev server (npm run dev) proxies the world's page from there, so connect and town writes from that origin are the page's own`;
