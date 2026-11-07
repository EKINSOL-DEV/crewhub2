/**
 * The key the host holds and loops' verdict on it, written in one place (round 61, H6). The connection (connection.ts)
 * owns which key is current, when a check runs and the slow re-check timer; this module owns the record and every
 * transition of its state, so a key's word (`unchecked`, `checking`, `ok`, `rejected`) is written here and nowhere
 * else, and the connection only reads it (`HeldKey` is read-only to it). The log and step lines stay beside the
 * calls in the connection: they say where loops is and how long the check took, which only it knows.
 *
 * The table (a `-` is no change, the call answers false):
 *
 * | from        | `checking`   | `checked(ok)`              | `checked(rejected)`          | `checked(unreachable)`          | `secondOpinion("unauthorized")`     | `secondOpinion("ok")`     |
 * | ----------- | ------------ | -------------------------- | ---------------------------- | ------------------------------- | ----------------------------------- | ------------------------- |
 * | `unchecked` | `checking`   | `ok`, the principal's name | `rejected`, loops' reason    | the state before the check      | `rejected`, the stream's reason     | `ok`                      |
 * | `ok`        | `checking`   | (the same)                 | (the same)                   | (the same)                      | `rejected`, the stream's reason     | -                         |
 * | `rejected`  | `checking`   | (the same)                 | (the same)                   | (the same: the reason kept)     | -                                   | `ok`                      |
 * | `checking`  | `checking`   | (the same)                 | (the same)                   | `unchecked`                     | `rejected`, the stream's reason     | `ok`                      |
 *
 * `ok` drops the reason; `rejected` sets it; `unreachable` says nothing about the key (a timeout, a 5xx, a loops that
 * is restarting: keyCheck.ts), so the key keeps the state it had before the check, and a fresh key stays `unchecked`.
 * The stream's second opinion changes the word only when it differs (the answer says whether it did, so the
 * connection logs each change once). Tests: `keyHolder.test.ts` pins the table; `connection.test.ts` drives it
 * through the connection against the stub.
 */
import type { HostKeyState } from "@crewhub/loops-client";
import type { KeySource } from "./config.ts";
import type { KeyVerdict } from "./keyCheck.ts";

/** What the stream's 401 or 403 means for a key that was accepted before: health's `connection.key.reason`. */
export const STREAM_REFUSED_REASON = "crewhub-loops refused the key on the event stream (401 or 403): it was revoked or its bot disabled meanwhile. Paste a new access key, or forget this one.";

export type KeyState = Exclude<HostKeyState["state"], "none">;

/** The host's key and what loops said about it, as the connection reads it. The text of the key lives here and in the client's closure only. */
export interface HeldKey {
  readonly key: string;
  /** The agent name from the file, or the principal loops answered. */
  readonly name: string;
  readonly source: KeySource;
  /** `unchecked` until loops answered about it; `checking` only while a check runs. */
  readonly state: KeyState;
  readonly reason?: string;
}

/** The record as this module writes it. */
type Held = { -readonly [K in keyof HeldKey]: HeldKey[K] };
const of = (held: HeldKey): Held => held as Held;
/** The state each key had when its check started: given back when loops does not answer. Not a field: the record is the five fields the connection reads. */
const befores = new WeakMap<HeldKey, KeyState>();

/** A key to hold: `unchecked` from a file at start, `ok` when pasted (the route checked it a moment ago). */
export function holdKey(key: string, name: string, source: KeySource, state: "unchecked" | "ok"): HeldKey {
  const held: Held = { key, name, source, state };
  return held;
}

/** A check starts: `checking`, remembering the state it had (an unreachable loops gives it back). */
export function checking(held: HeldKey): void {
  befores.set(held, held.state);
  of(held).state = "checking";
}

/** The check's verdict (keyCheck.ts), applied as it is: `ok` with the principal's name, `rejected` with the reason, `unreachable` the state before. */
export function checked(held: HeldKey, outcome: KeyVerdict): void {
  const mine = of(held);
  if (outcome.state === "ok") {
    mine.state = "ok";
    delete mine.reason;
    mine.name = outcome.name;
  } else if (outcome.state === "rejected") {
    mine.state = "rejected";
    mine.reason = outcome.reason;
  } else {
    // Nothing is known about the key: it keeps the state it had (a fresh key stays unchecked), never rejected.
    const before = befores.get(held) ?? "unchecked";
    mine.state = before === "checking" ? "unchecked" : before;
  }
}

/**
 * The stream's second opinion: a confirmed 401 or 403 is `rejected` with the stream's reason, an open stream `ok`.
 * The word changes only when it differs; the answer says whether it did (the connection logs each change once).
 */
export function secondOpinion(held: HeldKey, word: "unauthorized" | "ok"): boolean {
  const mine = of(held);
  if (word === "unauthorized") {
    if (mine.state === "rejected") return false;
    mine.state = "rejected";
    mine.reason = STREAM_REFUSED_REASON;
    return true;
  }
  if (mine.state === "ok") return false;
  mine.state = "ok";
  delete mine.reason;
  return true;
}
