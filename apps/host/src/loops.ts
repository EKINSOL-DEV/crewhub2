/**
 * The host's reads of crewhub-loops: GET only, with the key, every path through the allow-list, over the transport
 * seam of `transport.ts` (TCP today, the Unix socket when configured). The key lives in this closure and nowhere
 * else; it is never logged and any text that goes back to a browser is scrubbed of it (a defence in depth: loops
 * does not echo the Authorization header, this makes sure).
 */
import { UPSTREAM_BODY_LIMIT, UpstreamTooLarge, readCapped } from "./bodyCap.ts";
import { type LoopsTarget, createTransport } from "./transport.ts";

export type { LoopsTarget } from "./transport.ts";

export interface LoopsResponse {
  status: number;
  /** The body as text, scrubbed of the key. */
  text: string;
  contentType: string;
}

export interface LoopsClient {
  /** How loops is reached: `tcp` (the URL) or `unix` (the socket). For health. */
  readonly transport: "tcp" | "unix";
  /**
   * One GET; the path and query go through the allow-list. Throws on a network error or timeout, and
   * `UpstreamTooLarge` (bodyCap.ts) for a body past the cap, which is cut off, never read whole.
   */
  get(path: string, query?: Record<string, string>, timeoutMs?: number): Promise<LoopsResponse>;
  /** The same, parsed; `body` is null when the body is not JSON, or past the cap (said to `onTooLarge`). */
  getJson<T = unknown>(path: string, query?: Record<string, string>): Promise<{ status: number; body: T | null }>;
  /**
   * A public read without the key (round 29): `GET /api/health` is public, and crewhub-loops main refuses it to a
   * limited key (a viewer gets 403 there, #959), so the version is read keyless, as discovery probes it.
   */
  getPublicJson<T = unknown>(path: string, query?: Record<string, string>): Promise<{ status: number; body: T | null }>;
  /**
   * Opens the NDJSON stream from `resume` (`after=<seq>`, or `cursor=<sealed token>` from a heartbeat or
   * `GET /api/events`; never both); the caller reads the body. Throws on a network error.
   */
  stream(resume: StreamResume, signal: AbortSignal): Promise<Response>;
  /** Replaces every occurrence of the key in `text`. */
  scrub(text: string): string;
}

/** Where a stream resumes: the last applied seq, or the sealed cursor loops gave for exactly that position (CL-406). */
export type StreamResume = { after: number } | { cursor: string };

export const READ_TIMEOUT_MS = 10_000;

export interface LoopsClientOptions {
  /** How long one read may take before it counts as loops not answering. Default 10 s; tests shorten it. */
  readTimeoutMs?: number;
  /** The most bytes one body may carry (question 15). Default `UPSTREAM_BODY_LIMIT`, 4 MB; tests shorten it. */
  bodyLimit?: number;
  /** Told of every body the cap cut off on a parsed read (`getJson`, `getPublicJson`), for one log line; never the body. */
  onTooLarge?: (path: string, error: UpstreamTooLarge) => void;
}

/** `target` is the URL (TCP) or the socket path (Unix); a plain string is a URL, for the callers from before the seam. */
export function createLoopsClient(target: LoopsTarget | string, key: string, options: LoopsClientOptions = {}): LoopsClient {
  const resolved: LoopsTarget = typeof target === "string" ? { transport: "tcp", url: target } : target;
  const transport = createTransport(resolved, { Authorization: `Bearer ${key}` });
  const keyless = createTransport(resolved, {});
  const scrub = (text: string): string => (key.length > 0 && text.includes(key) ? text.split(key).join("[redacted]") : text);
  const readTimeoutMs = options.readTimeoutMs ?? READ_TIMEOUT_MS;
  const bodyLimit = options.bodyLimit ?? UPSTREAM_BODY_LIMIT;
  const tooLarge = (path: string, error: unknown): error is UpstreamTooLarge => {
    if (!(error instanceof UpstreamTooLarge)) return false;
    options.onTooLarge?.(path, error);
    return true;
  };

  async function get(path: string, query: Record<string, string> = {}, timeoutMs = readTimeoutMs): Promise<LoopsResponse> {
    const response = await transport.request(path, query, { accept: "application/json", timeoutMs });
    const text = await readCapped(response, bodyLimit);
    return { status: response.status, text: scrub(text), contentType: response.headers.get("content-type") ?? "application/json" };
  }

  return {
    transport: transport.kind,
    get,
    async getJson<T>(path: string, query: Record<string, string> = {}) {
      let response: LoopsResponse;
      try {
        response = await get(path, query);
      } catch (error) {
        // A body past the cap is no answer: the status with a null body, as a body that is not JSON (and one line said).
        if (!tooLarge(path, error)) throw error;
        return { status: error.status, body: null };
      }
      let body: T | null = null;
      try {
        body = JSON.parse(response.text) as T;
      } catch {
        body = null;
      }
      return { status: response.status, body };
    },
    async getPublicJson<T>(path: string, query: Record<string, string> = {}) {
      const response = await keyless.request(path, query, { accept: "application/json", timeoutMs: readTimeoutMs });
      let body: T | null = null;
      try {
        body = JSON.parse(await readCapped(response, bodyLimit)) as T;
      } catch (error) {
        tooLarge(path, error);
        body = null;
      }
      return { status: response.status, body };
    },
    stream(resume, signal) {
      const query = "cursor" in resume ? { cursor: resume.cursor } : { after: String(resume.after) };
      return transport.request("/api/events/stream", query, { accept: "application/x-ndjson", signal });
    },
    scrub,
  };
}

/** True for a status that means the key is missing, wrong, disabled or forbidden. */
export function isUnauthorized(status: number): boolean {
  return status === 401 || status === 403;
}
