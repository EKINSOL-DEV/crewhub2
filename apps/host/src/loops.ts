/**
 * The host's reads of crewhub-loops: `fetch` with the key, GET only, every path through the allow-list.
 * The key lives in this closure and nowhere else; it is never logged and any text that goes back to a browser
 * is scrubbed of it (a defence in depth: loops does not echo the Authorization header, this makes sure).
 */
import { allowedLoopsPath } from "./allowList.ts";

export interface LoopsResponse {
  status: number;
  /** The body as text, scrubbed of the key. */
  text: string;
  contentType: string;
}

export interface LoopsClient {
  /** One GET; the path and query go through the allow-list. Throws on a network error or timeout. */
  get(path: string, query?: Record<string, string>, timeoutMs?: number): Promise<LoopsResponse>;
  /** The same, parsed; `body` is null when the body is not JSON. */
  getJson<T = unknown>(path: string, query?: Record<string, string>): Promise<{ status: number; body: T | null }>;
  /** Opens the NDJSON stream; the caller reads the body. Throws on a network error. */
  stream(after: number, signal: AbortSignal): Promise<Response>;
  /** Replaces every occurrence of the key in `text`. */
  scrub(text: string): string;
}

const READ_TIMEOUT_MS = 10_000;

export function createLoopsClient(loopsUrl: string, key: string): LoopsClient {
  const base = loopsUrl.replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  const scrub = (text: string): string => (key.length > 0 && text.includes(key) ? text.split(key).join("[redacted]") : text);

  async function get(path: string, query: Record<string, string> = {}, timeoutMs = READ_TIMEOUT_MS): Promise<LoopsResponse> {
    const url = base + allowedLoopsPath(path, query);
    const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    const text = await response.text();
    return { status: response.status, text: scrub(text), contentType: response.headers.get("content-type") ?? "application/json" };
  }

  return {
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
    stream(after, signal) {
      const url = base + allowedLoopsPath("/api/events/stream", { after: String(after) });
      return fetch(url, { method: "GET", headers: { ...headers, Accept: "application/x-ndjson" }, signal, redirect: "error" });
    },
    scrub,
  };
}

/** True for a status that means the key is missing, wrong, disabled or forbidden. */
export function isUnauthorized(status: number): boolean {
  return status === 401 || status === 403;
}
