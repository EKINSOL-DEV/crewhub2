/*
 * The checkout id: which working copy of the repository a host belongs to, for the one question a dev server must ask
 * before it proxies to a host (`apps/world/hostPort.ts`, `devHostVerdict`): "is the host on that port this checkout's?"
 * On a Mac with several checkouts (worktrees, copies) a port holds somebody's host, and a page from one checkout
 * talking to another checkout's host is a mismatch nobody sees. Health carries the id (`checkout`), never the path: a
 * path in health would be readable by any page that reaches the host (health answers before the pairing gate), and a
 * path on a shared machine names a person. The id is the first 12 hex characters of SHA-256 over the repository root's
 * real path (symlinks resolved, no trailing separator), so two checkouts of the same commit still differ, and the same
 * root always gives the same id whichever way it was named. `realpath` is a parameter for the test. The probe a dev
 * server makes (`probeCheckout`, one loopback fetch of health) lives here too: the host package may talk to a host.
 */
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import { readRunFile } from "./runFile.ts";

export const CHECKOUT_ID_LENGTH = 12;

/** The id of the checkout whose repository root is `root`. */
export function checkoutId(root: string, realpath: (p: string) => string = realpathSync): string {
  let resolved: string;
  try {
    resolved = realpath(root);
  } catch {
    resolved = path.resolve(root);
  }
  const normal = resolved.length > 1 ? resolved.replace(/[\\/]+$/, "") : resolved;
  return createHash("sha256").update(normal).digest("hex").slice(0, CHECKOUT_ID_LENGTH);
}

/** What a port answered a dev server: nothing, not a host, or a host with what its health tells. */
export type HostAnswer = { kind: "silent" } | { kind: "not-a-host" } | { kind: "host"; checkout: string | null; keyName: string };

/** Health's body as an answer: a host's when it has the shape the page's probe accepts, else not a host. */
export function answerFromHealth(body: unknown): HostAnswer {
  if (body === null || typeof body !== "object") return { kind: "not-a-host" };
  const health = body as Record<string, unknown>;
  if (!["ok", "down", "unauthorized"].includes(health["loops"] as string) || typeof health["keyName"] !== "string") return { kind: "not-a-host" };
  const checkout = typeof health["checkout"] === "string" && /^[0-9a-f]{6,64}$/.test(health["checkout"]) ? health["checkout"] : null;
  return { kind: "host", checkout, keyName: health["keyName"] };
}

/** Asks `127.0.0.1:port/world-api/health` once (loopback only, `timeoutMs`); silent on any failure. */
export async function probeCheckout(port: number, timeoutMs = 1500): Promise<HostAnswer> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/world-api/health`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    if (!response.ok) return { kind: "not-a-host" };
    return answerFromHealth(await response.json());
  } catch {
    return { kind: "silent" };
  }
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
export async function tellDevOrigin(port: number, origin: string, checkout: string, timeoutMs = 1500, secret: string | null = readRunFile(port)?.mintSecret ?? null): Promise<TellOutcome> {
  if (secret === null) return { kind: "no-run-file" };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/world-api/dev-origin`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "content-type": "application/json", accept: "application/json", "x-crewhub-world-mint": secret },
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
