/**
 * Pairing, per tab (round 27, the alternative to the cookie): a one-time link `/#pair=<token>` carries the token in the
 * URL fragment (a fragment is never sent to a server and never in a log); the page exchanges it once for a bearer
 * (`POST /world-api/pair`, the token in the `x-world-pair` header), keeps the bearer in its tab's sessionStorage and
 * sends it in the same header on every host request, the stream included (the source streams with fetch). Its own
 * header, not `Authorization`: the bundle guard proves by that word that the loops key never reaches the browser. No cookie: nothing is attached by the browser on its own, so another loopback port never receives the
 * pairing and no cross-site request can carry it (CSRF goes with the cookie; the Origin guard stays as a second line).
 * Pure state here, no HTTP: `host.ts` wires it.
 *
 * - A token is 32 random bytes, base64url. Only its SHA-256 is kept, with its expiry (10 minutes); redeeming deletes it.
 * - The bearer is `<id>.<mac>`: 16 random bytes and their HMAC-SHA256 under the pairing secret, checked with a
 *   constant-time compare. The secret alone decides: a per-run secret makes a restart invalidate every pairing; a secret
 *   kept in `CREWHUB_WORLD_PAIRING_FILE` (mode 0600) keeps them.
 * - Expiry: a bearer not used for `idleMs` (default 30 days; 0 never) is refused; its last use is kept in memory per id,
 *   so after a host restart the first use counts as now (the window starts again, never shorter).
 * - Neither the token, nor the bearer, nor the secret is ever logged or put in a log line.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PAIR_TTL_MS = 10 * 60_000;
/** The fragment key of a pairing link: `http://127.0.0.1:5180/#pair=<token>`. */
export const PAIR_FRAGMENT = "pair";
/** How long a pairing may go unused before it is refused, by default: 30 days. `0` is never. */
export const DEFAULT_PAIRING_IDLE_MS = 30 * 24 * 60 * 60_000;
const SECRET_BYTES = 32;
const TOKEN_BYTES = 32;
const COOKIE_ID_BYTES = 16;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface PairingOptions {
  /** The secret the cookies are signed with; a fresh random one when absent (per run). */
  secret?: Buffer;
  /** The clock, for tests. */
  now?: () => number;
  ttlMs?: number;
  /** A bearer unused this long is refused; 0 never. Default DEFAULT_PAIRING_IDLE_MS. */
  idleMs?: number;
}

export interface Pairing {
  /** A fresh single-use token, valid `ttlMs`. The caller turns it into a link; it is never logged here. */
  mintToken(): string;
  /** Exchanges a token once: the bearer the tab keeps, or null for an unknown, used or expired token. */
  redeem(token: string): string | null;
  /** Whether the `x-world-pair` header carries a valid, unexpired bearer; a valid one counts as used now. */
  isPaired(header: string | undefined): boolean;
  /** How many unredeemed, unexpired tokens are out (tests). */
  pending(): number;
  /** The idle window, for health and the Pair screen. */
  idleMs: number;
}

const b64url = (bytes: Buffer) => bytes.toString("base64url");
const hashToken = (token: string) => createHmac("sha256", "crewhub-world-pair-token").update(token).digest("base64url");

export function createPairing(options: PairingOptions = {}): Pairing {
  const secret = options.secret ?? randomBytes(SECRET_BYTES);
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? PAIR_TTL_MS;
  const idleMs = options.idleMs ?? DEFAULT_PAIRING_IDLE_MS;
  /** token hash → expiry (ms). */
  const tokens = new Map<string, number>();
  /** bearer id → last use (ms); bounded by use (a bearer id is 16 random bytes, never a caller's choice). */
  const lastSeen = new Map<string, number>();
  const LAST_SEEN_MAX = 1024;

  const mac = (id: string) => createHmac("sha256", secret).update(`cookie:${id}`).digest("base64url");

  function prune(): void {
    const t = now();
    for (const [hash, expiry] of tokens) if (expiry <= t) tokens.delete(hash);
  }

  return {
    mintToken() {
      prune();
      const token = b64url(randomBytes(TOKEN_BYTES));
      tokens.set(hashToken(token), now() + ttlMs);
      return token;
    },
    redeem(token) {
      if (typeof token !== "string" || token.length !== 43 || !BASE64URL.test(token)) return null;
      const hash = hashToken(token);
      const expiry = tokens.get(hash);
      if (expiry === undefined) return null;
      tokens.delete(hash);
      if (expiry <= now()) return null;
      const id = b64url(randomBytes(COOKIE_ID_BYTES));
      return `${id}.${mac(id)}`;
    },
    isPaired(header) {
      const value = readPairHeader(header);
      if (value === null) return false;
      const dot = value.indexOf(".");
      if (dot <= 0) return false;
      const id = value.slice(0, dot);
      const given = value.slice(dot + 1);
      if (!BASE64URL.test(id) || !BASE64URL.test(given)) return false;
      const expected = mac(id);
      if (Buffer.byteLength(given) !== Buffer.byteLength(expected)) return false;
      if (!timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return false;
      const t = now();
      const seen = lastSeen.get(id);
      if (idleMs > 0 && seen !== undefined && t - seen > idleMs) return false;
      if (seen === undefined && lastSeen.size >= LAST_SEEN_MAX) lastSeen.delete(lastSeen.keys().next().value as string);
      lastSeen.delete(id);
      lastSeen.set(id, t);
      return true;
    },
    pending() {
      prune();
      return tokens.size;
    },
    idleMs,
  };
}

/** The header the pairing rides in: the token at `POST /world-api/pair`, the bearer everywhere else. */
export const PAIR_HEADER = "x-world-pair";

/** The value of the pairing header (`<id>.<mac>`, or a token), or null when absent or not of that shape. */
export function readPairHeader(header: string | undefined): string | null {
  if (header === undefined) return null;
  const m = /^([A-Za-z0-9_.-]{1,200})$/.exec(header.trim());
  return m === null ? null : (m[1] as string);
}

/** The pairing link for `origin`: the token in the fragment, which a browser never sends to a server. */
export const pairLink = (origin: string, token: string): string => `${origin.replace(/\/$/, "")}/#${PAIR_FRAGMENT}=${token}`;

/** A plain HTML page: the link is used up, expired or unknown. */
export const PAIR_REFUSED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CrewHub World: link expired</title>
<style>body{font-family:system-ui,sans-serif;margin:3rem auto;max-width:36rem;padding:0 1rem;line-height:1.5}code{padding:.1em .3em;border-radius:.3em;background:rgba(127,127,127,.18)}</style></head>
<body><h1>This link has expired or was already used.</h1><p>Run <code>npm run world</code> for a new one.</p></body></html>
`;

/**
 * The pairing secret from a file, created when missing: 32 random bytes, base64url, mode 0600. A readable file with
 * loose permissions is tightened; one whose text decodes to fewer than 32 bytes is replaced. The caller keeps the
 * Buffer in memory and nowhere else.
 */
export function loadPairingSecret(file: string): Buffer {
  let text: string | null = null;
  try {
    text = readFileSync(file, "utf8").trim();
  } catch {
    text = null;
  }
  if (text !== null && text !== "") {
    const stats = statSync(file);
    if ((stats.mode & 0o077) !== 0) chmodSync(file, 0o600);
    const decoded = Buffer.from(text, "base64url");
    // A file that does not decode to a whole secret (truncated, edited) would make a short HMAC key (review N1):
    // it is replaced by a fresh one, which only unpairs the browsers paired under it.
    if (decoded.length >= SECRET_BYTES) return decoded;
  }
  const secret = randomBytes(SECRET_BYTES);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, b64url(secret) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return secret;
}
