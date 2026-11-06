/*
 * A program on this machine and the host on a port: one road (round 60, H1). `npm run host -- open` and `npm run world`
 * ask a host that already runs for a pairing link (`mint`), the doctor asks whether its port is free, a host's or
 * somebody else's (`portState`), and this checkout's dev server asks whose host answers (`probe`, through
 * `checkout.ts`) and tells it its origin (`tellOrigin`). Every question is one loopback request with a short timeout
 * (the doctor's a socket connect first), never a browser's (no Origin header), and every answer is read once: health through the wire's own reader
 * (`readHostHealth`, `@crewhub/loops-client`), the run file's secret through `runFile.ts`. Nothing here throws on a
 * dead port: silence, "not a host", "free" or null are answers. The secret is never printed.
 */
import { createConnection } from "node:net";
// The wire by relative path, not `@crewhub/loops-client`: the Vite config (apps/world) imports this road, and Vite leaves a bare
// package import to Node, which cannot load TypeScript on Node 22.12; a relative import is bundled with the config (round 60 N4).
import { type HostHealth, readHostHealth, worldApiPath } from "../../../packages/loops-client/src/hostWire.ts";
import { readRunFile, type RunFile } from "./runFile.ts";

/** `GET /pair-mint` with the run file's secret in this header: a fresh pairing link from a host that already runs. */
export const MINT_PATH = "/pair-mint";
export const MINT_HEADER = "x-crewhub-world-mint";

/** What a port answered: nothing, something that is not the world's host, or a host with what its health tells. */
export type Probe = { kind: "silent" } | { kind: "not-a-host" } | { kind: "host"; health: HostHealth };

/**
 * Asks `127.0.0.1:port/world-api/health` once (loopback only, `timeoutMs`). Silent on any failure (nothing listens, a
 * timeout, a body that is not JSON); not a host on a non-2xx answer or a body the wire's reader refuses (`loops` one of
 * its three words and `keyName` a string, or it is no host's health).
 */
export async function probe(port: number, timeoutMs = 1500): Promise<Probe> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`http://127.0.0.1:${port}${worldApiPath("/health")}`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    if (!response.ok) return { kind: "not-a-host" };
    body = await response.json();
  } catch {
    return { kind: "silent" };
  }
  const health = readHostHealth(body);
  return health === null ? { kind: "not-a-host" } : { kind: "host", health };
}

/** Is the host's port free, taken by a host (then its health), or by something else? */
export type PortState = { kind: "free" } | { kind: "host"; health: HostHealth } | { kind: "taken" };

/** A socket connect first (1 s): nothing listening is `free`; then `probe`: a host, or something else (`taken`). */
export async function portState(port: number): Promise<PortState> {
  const listening = await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
  if (!listening) return { kind: "free" };
  const answer = await probe(port);
  return answer.kind === "host" ? answer : { kind: "taken" };
}

/**
 * Asks the host that runs on `port` for a one-time pairing link, with the run file's secret (`runFile.ts`; the file's
 * 0600 mode is what makes "can read it" mean "the same user"). The link is minted on the host's own origin; `origin`
 * puts another in its place (the Vite dev server, which proxies the pairing to the host). Null when there is no run
 * file, no host answers (1.5 s), or it refuses the secret.
 */
export async function mint(port: number, origin: string | null): Promise<string | null> {
  const secret = readRunFile(port)?.mintSecret ?? null;
  if (secret === null) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${MINT_PATH}`, { headers: { [MINT_HEADER]: secret }, signal: AbortSignal.timeout(1500) });
    if (!response.ok) return null;
    const body = (await response.json()) as { link?: unknown };
    if (typeof body.link !== "string") return null;
    return origin === null ? body.link : body.link.replace(/^https?:\/\/[^/]+/, origin);
  } catch {
    return null;
  }
}

/**
 * Why `npm run world` will not open a browser on the host that runs on `port` (design choice H2, round 72, `refuse`):
 * its run file says it serves no built world (`npm run host`, whose page is a JSON error). Null when the host serves the
 * world, when its run file is from before and does not say, or when there is no run file. A host someone started is
 * not ended by another command: the line says what to do instead.
 */
export function worldRefusal(file: RunFile | null, port: number): string | null {
  if (file?.world !== false) return null;
  return `a development host (npm run host) runs on ${port} and serves no built world: stop it (Ctrl+C in its terminal), or open your Vite page (npm run dev)`;
}

/** What the host said when the dev server told it an origin (`POST /world-api/dev-origin`, devOrigin.ts). */
export type TellOutcome = { kind: "accepted"; origins: string[] } | { kind: "refused"; status: number; message: string } | { kind: "no-route" } | { kind: "no-run-file" } | { kind: "silent" };

/** The outcome from a status and body: 200 accepted, 404 or 405 an older host without the route, else refused with its words. */
export function tellOutcome(status: number, body: unknown): TellOutcome {
  const record = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (status === 200) return { kind: "accepted", origins: Array.isArray(record["origins"]) ? (record["origins"] as string[]).filter((o) => typeof o === "string") : [] };
  if (status === 404 || status === 405) return { kind: "no-route" };
  return { kind: "refused", status, message: typeof record["message"] === "string" ? record["message"] : `status ${status}` };
}

/**
 * Tells the host on `port` the dev server's origin, as this checkout and this user (loopback only, no Origin header: a
 * program's request; the run file's secret in the mint header, round 26). Without a readable run file the host cannot
 * be told: `{ kind: "no-run-file" }`, and the dev server says so.
 */
export async function tellOrigin(port: number, origin: string, checkout: string, timeoutMs = 1500, secret: string | null = readRunFile(port)?.mintSecret ?? null): Promise<TellOutcome> {
  // No run file to read: nothing to say when nothing listens there yet (the usual start order); only a host that
  // answers without a readable run file is "cannot be told".
  if (secret === null) return (await probe(port, timeoutMs)).kind === "silent" ? { kind: "silent" } : { kind: "no-run-file" };
  try {
    const response = await fetch(`http://127.0.0.1:${port}${worldApiPath("/dev-origin")}`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "content-type": "application/json", accept: "application/json", [MINT_HEADER]: secret },
      body: JSON.stringify({ origin, checkout }),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return tellOutcome(response.status, body);
  } catch {
    return { kind: "silent" };
  }
}
