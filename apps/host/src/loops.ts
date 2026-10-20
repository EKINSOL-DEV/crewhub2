/**
 * The host's reads of crewhub-loops: GET only, with the key, every path through the allow-list, over the transport
 * seam of `transport.ts` (TCP today, the Unix socket when configured). The key lives in this closure and nowhere
 * else; it is never logged and any text that goes back to a browser is scrubbed of it (a defence in depth: loops
 * does not echo the Authorization header, this makes sure).
 */
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
  /** One GET; the path and query go through the allow-list. Throws on a network error or timeout. */
  get(path: string, query?: Record<string, string>, timeoutMs?: number): Promise<LoopsResponse>;
  /** The same, parsed; `body` is null when the body is not JSON. */
  getJson<T = unknown>(path: string, query?: Record<string, string>): Promise<{ status: number; body: T | null }>;
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

const READ_TIMEOUT_MS = 10_000;

/** `target` is the URL (TCP) or the socket path (Unix); a plain string is a URL, for the callers from before the seam. */
export function createLoopsClient(target: LoopsTarget | string, key: string): LoopsClient {
  const transport = createTransport(typeof target === "string" ? { transport: "tcp", url: target } : target, { Authorization: `Bearer ${key}` });
  const scrub = (text: string): string => (key.length > 0 && text.includes(key) ? text.split(key).join("[redacted]") : text);

  async function get(path: string, query: Record<string, string> = {}, timeoutMs = READ_TIMEOUT_MS): Promise<LoopsResponse> {
    const response = await transport.request(path, query, { accept: "application/json", timeoutMs });
    const text = await response.text();
    return { status: response.status, text: scrub(text), contentType: response.headers.get("content-type") ?? "application/json" };
  }

  return {
    transport: transport.kind,
    get,
    async getJson<T>(path: string, query: Record<string, string> = {}) {
      const response = await get(path, query);
      let body: T | null = null;
      try {
        body = JSON.parse(response.text) as T;
      } catch {
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
