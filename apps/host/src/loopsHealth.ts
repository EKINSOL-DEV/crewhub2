/**
 * The one reader of crewhub-loops' health (round 61, H4): `GET /api/health`, public and read without a key (crewhub-loops
 * main refuses it to a limited key: a viewer gets 403 there, #959, round 29), parsed once into `{status, ok, version}`.
 * Its callers: the discovery's probes and the key's health probe (`loopsHealth`, `loopsAnswers`: a fresh keyless
 * transport per call, 1.5 s), the doctor's health line, and the client's `health()` (loops.ts: the keyless transport it
 * already has, the read timeout), which the upstream reads loops' version with each time its stream opens. Nothing
 * answering within `timeoutMs`, a refused connection or a transport error is null; a body that is not JSON, or past the
 * cap (question 15, `bodyCap.ts`), is a health answer without `ok` and without a version. Tests: `loopsHealth.test.ts`
 * and `bodyCap.test.ts` against a small HTTP server.
 */
import { UPSTREAM_BODY_LIMIT, UpstreamTooLarge, readCapped } from "./bodyCap.ts";
import { type LoopsTarget, type LoopsTransport, createTransport } from "./transport.ts";

export interface LoopsHealth {
  status: number;
  /** `200 {"ok":true,…}`: crewhub-loops is there. */
  ok: boolean;
  /** loops' `version` (the app says `0.1.0`; a checkout says its commit). */
  version?: string;
}

/**
 * One keyless read of `GET /api/health` over `transport`; null when nothing answers within `timeoutMs`. Its body is capped at
 * `limit` (question 15): a huge health page is no loops; `onTooLarge` hears one cut off, for the client's one log line.
 */
export async function readHealth(transport: LoopsTransport, timeoutMs: number, limit = UPSTREAM_BODY_LIMIT, onTooLarge?: (error: UpstreamTooLarge) => void): Promise<LoopsHealth | null> {
  try {
    const response = await transport.request("/api/health", {}, { accept: "application/json", timeoutMs });
    type HealthBody = { ok?: unknown; version?: unknown } | null;
    let body: HealthBody = null;
    try {
      body = JSON.parse(await readCapped(response, limit)) as HealthBody;
    } catch (error) {
      if (error instanceof UpstreamTooLarge) onTooLarge?.(error);
      body = null;
    }
    const out: LoopsHealth = { status: response.status, ok: response.status === 200 && body?.ok === true };
    if (typeof body?.version === "string") out.version = body.version;
    return out;
  } catch {
    return null;
  }
}

/** `GET /api/health` at `target` without a key, over a transport made for this read; null when nothing answers within `timeoutMs`. */
export function loopsHealth(target: LoopsTarget, timeoutMs = 1500): Promise<LoopsHealth | null> {
  return readHealth(createTransport(target, {}), timeoutMs);
}

/** True for `200 {"ok":true,…}`: crewhub-loops is there. */
export async function loopsAnswers(target: LoopsTarget, timeoutMs = 1500): Promise<boolean> {
  return (await loopsHealth(target, timeoutMs))?.ok === true;
}
