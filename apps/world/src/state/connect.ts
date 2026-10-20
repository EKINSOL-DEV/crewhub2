/* The world side of "a smooth connection" (spec addendum): pure helpers behind the Connect screens and the Connection
   panel. `connectScreen` maps the host's health to the one screen the world shows instead of the town; the key helpers
   handle a pasted access key (trimmed, shaped, only its tail ever shown); `connectOutcome` turns the host's answer to
   `POST /world-api/connect` into words. Nothing here keeps a key, logs or touches the DOM. */
import { needsPairing, type SourceDecision } from "./source.ts";

/** The screens between the demo decision and the town, in the order the person meets them. `null` is the town. */
export type ConnectScreen = "no-loops" | "pair" | "connect" | "checking" | "rejected" | "loops-down";

/**
 * Which screen stands in for the town. The demo never has one; a silent host neither (the chip says what it knows). A
 * host from before the smooth connection only knows pairing. Otherwise: no loops found comes first (pairing cannot
 * help yet), then this browser's pairing, then the key: none (connect), being checked, rejected. With a good key the
 * host must still be reading loops (`loops: "ok"`) before the town shows: an empty clearing over a loops that is down or
 * refuses the key would say "no projects", which is not known. Once the town runs, the chip tells the stream's story.
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
      return decision.health.loops === "down" ? "loops-down" : decision.health.loops === "unauthorized" ? "rejected" : null;
  }
}

/**
 * A pasted key as loops shows it: whitespace and line breaks a terminal wrapped it with go, so do surrounding quotes and
 * backticks and the `Authorization: Bearer` line the loops dialog shows next to the key.
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

