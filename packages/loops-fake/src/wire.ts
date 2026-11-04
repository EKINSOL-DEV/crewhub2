/**
 * Loops' wire grammar, the pure pieces, written once for the two servers that speak it: the fake (`fake.ts`) and the
 * host's test stub (`apps/host/test/loopsStub.ts`). Shapes and rules only, from crewhub-loops 4cdcd383
 * (`api/routers/events.py`, `api/errors.py`, `api/stream.py`): no server, no clock, no cursor sealing. Each server
 * seals and opens its own cursors and judges an `after` against its own floor; what it says then (the 410, its
 * message) is its own.
 */

/** Loops' error envelope: `detail` is null unless loops has more to say, which these servers never do. */
export interface ErrorBody {
  error: { code: string; message: string; detail: null };
}

export const errorBody = (code: string, message: string): ErrorBody => ({ error: { code, message, detail: null } });

/** An answer that is not 200: the status, loops' envelope for it, and the headers it carries (a 429's `Retry-After`). */
export class WireError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers: Record<string, string>;
  constructor(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
  get body(): ErrorBody {
    return errorBody(this.code, this.message);
  }
}

/** Loops' `Retry-After` on 429 `too_many_streams`. */
export const RETRY_AFTER_S = 5;

/** 429 `too_many_streams` with its `Retry-After`: loops' seconds, or a test's own value. */
export function tooManyStreams(retryAfter: number | string = RETRY_AFTER_S): WireError {
  return new WireError(429, "too_many_streams", "Too many open event streams", { "retry-after": String(retryAfter) });
}

/** Where a read or a stream resumes, as asked: `after` an integer, `cursor` a sealed token for the server to open, or neither. */
export type Resume = { after: number; cursor: null } | { after: null; cursor: string } | { after: null; cursor: null };

const INTEGER = /^\d+$/;
const safeInteger = (text: string): boolean => INTEGER.test(text) && Number.isSafeInteger(Number(text));

/**
 * `routers/events.py` `resolve_resume`: `after=` or `cursor=`, never both (400); else a `Last-Event-ID` header, an
 * integer as `after` and anything else judged as a sealed cursor (the `after` query wins over the header, CL-403).
 * An `after` query must be a non-negative safe integer (400 `Invalid after`); a header that is not one is a cursor.
 */
export function parseResume(query: URLSearchParams, lastEventId?: string | string[]): Resume {
  const token = query.get("cursor");
  if (token !== null) {
    if (query.has("after")) throw new WireError(400, "validation_error", "Send either cursor or after, not both");
    return { after: null, cursor: token };
  }
  const after = query.get("after");
  if (after !== null) {
    if (!safeInteger(after)) throw new WireError(400, "validation_error", "Invalid after");
    return { after: Number(after), cursor: null };
  }
  const header = Array.isArray(lastEventId) ? lastEventId[0] : lastEventId;
  if (header === undefined) return { after: null, cursor: null };
  const text = header.trim();
  return safeInteger(text) ? { after: Number(text), cursor: null } : { after: null, cursor: text };
}

/** The stream's heartbeat line (`api/stream.py`): the last sent seq, the sealed cursor of now (none on a loops before CL-406), `ts` last as loops writes it. */
export function heartbeatLine(seq: number, cursor: string | null, now: Date): { v: 1; type: "heartbeat"; seq: number; cursor?: string; ts: string } {
  return { v: 1, type: "heartbeat", seq, ...(cursor === null ? {} : { cursor }), ts: now.toISOString() };
}

/** One NDJSON line. */
export const ndjsonLine = (line: unknown): string => `${JSON.stringify(line)}\n`;
