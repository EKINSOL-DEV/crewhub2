/* The world side of "a smooth connection" (spec addendum): pure helpers behind the Connect screens and the Connection
   panel. `connectScreen` maps the host's health to the one screen the world shows instead of the town; the key helpers
   handle a pasted access key (trimmed, shaped, only its tail ever shown); `connectOutcome` turns the host's answer to
   `POST /world-api/connect` into words. Nothing here keeps a key, logs or touches the DOM. */
import type { ConnectionState, HostHealth, HostKeyState, HostSessionState } from "@crewhub/loops-client";
import { needsPairing, type SourceDecision } from "./source.ts";

/** The screens between the demo decision and the town, in the order the person meets them. `null` is the town. */
export type ConnectScreen = "no-loops" | "pair" | "connect" | "checking" | "rejected" | "loops-down";

/**
 * Which screen stands in for the town. The demo never has one; a silent host neither (the chip says what it knows). A
 * host from before the smooth connection only knows pairing and the legacy `loops` word. Otherwise the connection's
 * own states decide, and nothing else: no loops found comes first (pairing cannot help yet), then this browser's
 * pairing, then the key: none (connect), being checked, rejected (loops refused it: a definite 401/403 from a loops
 * that was up). With a key that is ok or not yet checked the host must still be reading loops (the stream `ok`, or
 * `busy`: the town shows and the chip says so) before the town shows: an empty clearing over a loops that is down would
 * say "no projects", which is not known. A stream loops refuses is a rejected key, never "loops down"; a stream that is
 * down, or none yet, is loops down, never a verdict on the key. Once the town runs, the chip tells the stream's story.
 */
export function connectScreen(decision: Pick<SourceDecision, "source" | "health">): ConnectScreen | null {
  if (decision.source !== "live" || decision.health === null) return null;
  const connection = decision.health.connection;
  if (connection === undefined) {
    if (needsPairing(decision)) return "pair";
    return decision.health.loops === "down" ? "loops-down" : decision.health.loops === "unauthorized" ? "rejected" : null;
  }
  if (connection.discovery.state === "searching") return "no-loops";
  if (needsPairing(decision)) return "pair";
  switch (connection.key.state) {
    case "none":
      return "connect";
    case "checking":
      return "checking";
    case "rejected":
      return "rejected";
    default:
      switch (connection.stream.state) {
        case "ok":
        case "busy":
          return null;
        case "unauthorized":
          return "rejected";
        default:
          return "loops-down";
      }
  }
}

/**
 * Once the town runs, the live source's state can still send the person back to a screen: `unpaired` (the host answered
 * 401 `not_paired` to the snapshot or the stream: a host restarted without its pairing secret, or the cookie gone) is the
 * Pair screen, not a Stale chip. When the source says `unauthorized` or `loops-down`, the host's health decides what
 * the key is, not the stream's word: the host tells the tabs' streams one legacy word, "unauthorized", both for a key
 * loops refused and for no key at all (after Forget this key in another tab), and a stream that then reconnects meets a
 * 503 `no_key`, which reads as loops down. So: the key `none` is the Connect screen (paste a key; the host has none),
 * `checking` the checking screen (a key pasted elsewhere is being checked), `rejected` the rejected screen with loops'
 * reason, the kept key and a field for another key (the key revoked while Live). A key the health still calls ok under
 * an `unauthorized` source is a health from before the change: no screen yet, the chip says Unauthorized until the App's
 * next read. A host from before the smooth connection (no connection in its health) keeps the old rule: unauthorized is
 * rejected. The App applies it; the source keeps asking, so a new link, or a new key the host switched to, brings the
 * town back by itself. Every other state is the chip's story: Stale keeps the last known town, which is still true as
 * far as it goes.
 */
export function liveScreen(state: ConnectionState | null, health?: Pick<HostHealth, "connection"> | null): ConnectScreen | null {
  if (state === "unpaired") return "pair";
  if (state !== "unauthorized" && state !== "loops-down") return null;
  const connection = health?.connection;
  if (connection === undefined) return state === "unauthorized" ? "rejected" : null;
  switch (connection.key.state) {
    case "none":
      return "connect";
    case "checking":
      return "checking";
    case "rejected":
      return "rejected";
    default:
      return null;
  }
}

/**
 * The health with the key's state the stream said (the host's own word on its key, on every status message since round 11),
 * which is fresher than any health read: after a Forget in another tab the stream says `none` at once. The rest of the
 * health (the reason, the name, the source) stays the read's. A health without a connection (an older host's read) gets one
 * with the states only, so the screens can decide; null stays null (nothing is known).
 */
export function withStreamKey(health: HostHealth | null, key: HostKeyState["state"] | null): HostHealth | null {
  if (health === null || key === null) return health;
  const connection = health.connection;
  if (connection === undefined) return { ...health, connection: { discovery: { state: "found" }, key: { state: key }, stream: { state: "idle", reconnects: 0 } } };
  if (connection.key.state === key) return health;
  return { ...health, connection: { ...connection, key: { ...connection.key, state: key } } };
}

/**
 * The person's chat session the host holds (round 12), in words for the panel: off (signed out), signed in as <name>,
 * expired (sign in again); null for a host from before, which keeps none.
 */
export function sessionWords(session: HostSessionState | undefined): { kind: "signed-out" | "signed-in" | "expired"; name: string | null } | null {
  if (session === undefined) return null;
  return { kind: session.state, name: session.name ?? null };
}

/** The host's `loopsCommit` (loops' own `version`) and, when the host saw another version first, that one: loops was updated under the host. */
export function loopsVersion(health: Pick<HostHealth, "loopsCommit" | "loopsCommitBefore"> | null | undefined): { version: string; before: string | null } | null {
  if (!health || typeof health.loopsCommit !== "string" || health.loopsCommit === "") return null;
  const before = typeof health.loopsCommitBefore === "string" && health.loopsCommitBefore !== "" && health.loopsCommitBefore !== health.loopsCommit ? health.loopsCommitBefore : null;
  return { version: health.loopsCommit, before };
}

/**
 * A pasted key as loops shows it: whitespace and line breaks a terminal wrapped it with go, so do surrounding quotes and
 * backticks and the bearer header line the loops dialog shows next to the key.
 */
export function normaliseKey(raw: string): string {
  let key = raw.replace(/\s+/g, " ").trim();
  key = key.replace(/^authorization\s*:\s*/i, "").replace(/^bearer\s+/i, "").trim();
  key = key.replace(/^["'`]+|["'`]+$/g, "");
  return key.replace(/\s+/g, "");
}

/** The last four characters: the only part of a key the page ever shows. */
export function keyTail(key: string): string {
  return key.slice(-4);
}

/** The shape loops makes (`botKey.ts`): `chl_` and 43 base64url characters; a little slack for a key made by hand. */
export function looksLikeKey(key: string): boolean {
  return /^chl_[A-Za-z0-9_-]{40,}$/.test(key);
}

export type ConnectOutcome = { kind: "ok" } | { kind: "not-paired" } | { kind: "rejected"; reason: string | null } | { kind: "failed"; reason: string | null };

/**
 * The host's answer to `POST /world-api/connect`: 2xx is a connected host; 401 `not_paired` asks to pair; 401, 403 and 422
 * are loops refusing the key (the host says why in `reason` or `message`); anything else is a failure to say in words.
 * A status of 0 is no answer at all.
 */
export function connectOutcome(status: number, body: unknown): ConnectOutcome {
  const record = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const words = typeof record["reason"] === "string" ? (record["reason"] as string) : typeof record["message"] === "string" ? (record["message"] as string) : null;
  if (status >= 200 && status < 300) return { kind: "ok" };
  if (status === 401 && record["error"] === "not_paired") return { kind: "not-paired" };
  if (status === 401 || status === 403 || status === 422) return { kind: "rejected", reason: words };
  if (status === 0) return { kind: "failed", reason: null };
  return { kind: "failed", reason: words ?? (typeof record["error"] === "string" ? (record["error"] as string) : String(status)) };
}

/** "just now", "40 s ago", "3 min ago", "3 h ago", "3 d ago"; null for no time or one that does not parse. */
/** "now", "in 40 s", "in 4 min", "in 2 h"; null for no time or one that does not parse. For the host's next re-check of a rejected key. */
export function untilTime(iso: string | undefined, nowMs: number): string | null {
  if (iso === undefined) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const seconds = Math.ceil((then - nowMs) / 1000);
  if (seconds <= 0) return "now";
  if (seconds < 60) return `in ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.round(minutes / 60)} h`;
}

export function relativeTime(iso: string | undefined, nowMs: number): string | null {
  if (iso === undefined) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

