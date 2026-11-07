/*
 * The checkout id: which working copy of the repository a host belongs to, for the one question a dev server must ask
 * before it proxies to a host (`apps/world/hostPort.ts`, `devHostVerdict`): "is the host on that port this checkout's?"
 * On a Mac with several checkouts (worktrees, copies) a port holds somebody's host, and a page from one checkout
 * talking to another checkout's host is a mismatch nobody sees. Health carries the id (`checkout`), never the path: a
 * path in health would be readable by any page that reaches the host (health answers before the pairing gate), and a
 * path on a shared machine names a person. The id is the first 12 hex characters of SHA-256 over the repository root's
 * real path (symlinks resolved, no trailing separator), so two checkouts of the same commit still differ, and the same
 * root always gives the same id whichever way it was named. `realpath` is a parameter for the test. The dev server's
 * question (`probeCheckout`: whose host answers on that port?) is asked on the program's road to a running host
 * (`runningHost.ts`, `probe`) and answered here as the two facts the verdict reads: the id and the key's name.
 */
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import type { HostHealth } from "../../../packages/loops-client/src/hostWire.ts";
import { probe } from "./runningHost.ts";

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

/** A host's health as the verdict's answer: its checkout id (null on a host from before the id) and the key's name. */
export function answerFromHealth(health: HostHealth): HostAnswer {
  return { kind: "host", checkout: health.checkout ?? null, keyName: health.keyName };
}

/** Asks the port once (`runningHost.ts`, `probe`: loopback only, `timeoutMs`; silent on any failure). */
export async function probeCheckout(port: number, timeoutMs = 1500): Promise<HostAnswer> {
  const answer = await probe(port, timeoutMs);
  return answer.kind === "host" ? answerFromHealth(answer.health) : answer;
}
