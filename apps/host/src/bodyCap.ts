/**
 * A size cap on what comes back from loops (question 15). Every body the host reads from loops' URL (a relayed page,
 * the snapshot's lists, the key check, a chat message, the tail) was read whole into memory with no limit; loops is a
 * local process, so a huge body means a broken loops or something else answering at its URL, and the host would hold
 * it all before it could say no. `readCapped` counts the bytes as they come and stops at the cap: the body is cut off
 * and the connection let go, never buffered whole. A `Content-Length` past the cap is refused before a byte is read; a
 * body without one (chunked) is counted. The stream's lines have the same cap (`stream.ts`).
 */

/** 4 MB: the host's own inbound limit on a town (`TOWN_BODY_LIMIT`); a page of 50 tickets is far under it. */
export const UPSTREAM_BODY_LIMIT = 4 * 1024 * 1024;

/** The one error a capped read throws of its own: the relay turns it into 502 `upstream_too_large`. */
export class UpstreamTooLarge extends Error {
  readonly limit: number;
  /** The bytes seen (or declared) when the read stopped: at least one past the limit. */
  readonly bytes: number;
  /** True when `Content-Length` said so and nothing of the body was read. */
  readonly declared: boolean;
  /** The status the body came with. */
  readonly status: number;
  constructor(limit: number, bytes: number, declared: boolean, status: number) {
    super(`loops answered ${status} with a body past ${limit} bytes (${declared ? "declared" : "read"} ${bytes}): cut off`);
    this.name = "UpstreamTooLarge";
    this.limit = limit;
    this.bytes = bytes;
    this.declared = declared;
    this.status = status;
  }
}

/** The `Content-Length` a response declares, or null when absent or not a plain non-negative integer. */
export function declaredLength(headers: Headers): number | null {
  const raw = headers.get("content-length");
  if (raw === null || !/^\d{1,15}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

/**
 * The body as text, at most `limit` bytes. Past the limit the body stream is cancelled (the connection let go) and
 * `UpstreamTooLarge` is thrown; a declared length past the limit is refused before reading. Any other failure of the
 * body (a cut connection) rejects as `response.text()` would.
 */
export async function readCapped(response: Response, limit: number): Promise<string> {
  const declared = declaredLength(response.headers);
  if (declared !== null && declared > limit) {
    await response.body?.cancel().catch(() => undefined);
    throw new UpstreamTooLarge(limit, declared, true, response.status);
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => undefined);
        throw new UpstreamTooLarge(limit, bytes, false, response.status);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * A log line that may repeat (the same read failing on every attempt) said at most once per `everyMs` per key, the
 * repeats counted into the next line. No timer: nothing to clear at close.
 */
export function createRepeatLog(log: (line: string) => void, everyMs: number, now: () => number = Date.now): (key: string, line: string) => void {
  const last = new Map<string, { at: number; held: number }>();
  return (key, line) => {
    const seen = last.get(key);
    const at = now();
    if (seen !== undefined && at - seen.at < everyMs) {
      seen.held += 1;
      return;
    }
    const held = seen?.held ?? 0;
    last.set(key, { at, held: 0 });
    log(held > 0 ? `${line} (and ${held} more like it since the last line)` : line);
  };
}
