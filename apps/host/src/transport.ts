/**
 * The transport seam: how the host reaches crewhub-loops. One `request(path, query, options)` that resolves with a
 * web `Response` (status, headers, body stream), so the rest of the host (`loops.ts`, `stream.ts`) never knows
 * whether it reads TCP or a Unix socket. Two implementations:
 *   - `tcp`: today's `fetch` against the loops URL (on the Mac: loopback into the app or into Docker Desktop).
 *   - `unix`: `node:http` with `socketPath` against the app's or the dev instance's `api.sock`, `Host: 127.0.0.1`.
 * Both put every path through the allow-list (`allowedLoopsPath`), send the same headers, follow no redirect
 * and honour the same signal and timeout.
 */
import { request as httpRequest, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { allowedLoopsPath } from "./allowList.ts";

export type LoopsTarget = { transport: "tcp"; url: string } | { transport: "unix"; socketPath: string };

export interface RequestOptions {
  /** The `Accept` header: `application/json` for a read, `application/x-ndjson` for the stream. */
  accept: string;
  /** Aborting it drops the connection (the stream). */
  signal?: AbortSignal;
  /** No answer (headers) within this long is a failure; none means no timeout (the stream). */
  timeoutMs?: number;
}

export interface LoopsTransport {
  readonly kind: "tcp" | "unix";
  /**
   * One GET. `path` and `query` go through the allow-list (a path outside it rejects before anything is sent).
   * Resolves with the status, the headers and the body as a stream; rejects on a connection error, a timeout, an
   * abort or a redirect.
   */
  request(path: string, query: Record<string, string>, options: RequestOptions): Promise<Response>;
}

/** The host sends the key as a bearer and never an Origin: loops treats the request as an agent's, not a browser's. */
export function createTransport(target: LoopsTarget, headers: Record<string, string>): LoopsTransport {
  return target.transport === "tcp" ? createTcpTransport(target.url, headers) : createUnixTransport(target.socketPath, headers);
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number | undefined): AbortSignal | undefined {
  const signals: AbortSignal[] = [];
  if (signal !== undefined) signals.push(signal);
  if (timeoutMs !== undefined) signals.push(AbortSignal.timeout(timeoutMs));
  if (signals.length === 0) return undefined;
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

export function createTcpTransport(loopsUrl: string, headers: Record<string, string>): LoopsTransport {
  const base = loopsUrl.replace(/\/+$/, "");
  return {
    kind: "tcp",
    async request(path, query, options) {
      const url = base + allowedLoopsPath(path, query);
      const signal = combinedSignal(options.signal, options.timeoutMs);
      return fetch(url, { method: "GET", headers: { ...headers, Accept: options.accept }, redirect: "error", ...(signal === undefined ? {} : { signal }) });
    },
  };
}

/** Statuses a web `Response` may not carry a body for. */
const NULL_BODY_STATUS = new Set([204, 205, 304]);

/** loops' response headers as a web `Headers` (a repeated header joined with a comma, as fetch does). */
function toHeaders(incoming: IncomingMessage): Headers {
  const out = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value === undefined) continue;
    out.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return out;
}

export function createUnixTransport(socketPath: string, headers: Record<string, string>): LoopsTransport {
  return {
    kind: "unix",
    async request(path, query, options) {
      const target = allowedLoopsPath(path, query);
      const signal = combinedSignal(options.signal, options.timeoutMs);
      return new Promise<Response>((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
          return;
        }
        const req = httpRequest({
          socketPath,
          path: target,
          method: "GET",
          headers: { ...headers, Accept: options.accept, Host: "127.0.0.1" },
          ...(signal === undefined ? {} : { signal }),
        });
        req.once("response", (incoming) => {
          const status = incoming.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            incoming.resume();
            req.destroy();
            reject(new Error(`loops redirected (${status}); the host follows no redirect`));
            return;
          }
          if (NULL_BODY_STATUS.has(status)) {
            incoming.resume();
            resolve(new Response(null, { status, headers: toHeaders(incoming) }));
            return;
          }
          // The body stream: reading it is the caller's, cancelling it drops the connection.
          const body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
          resolve(new Response(body, { status, headers: toHeaders(incoming) }));
        });
        req.once("error", (error: Error) => {
          // Before the headers an error fails the request; after them it ends the body stream instead. As fetch does, an
          // abort rejects with the signal's reason: `TimeoutError` for the timeout, `AbortError` for the caller's abort.
          reject(signal?.aborted && signal.reason instanceof Error ? signal.reason : error);
        });
        req.end();
      });
    },
  };
}
