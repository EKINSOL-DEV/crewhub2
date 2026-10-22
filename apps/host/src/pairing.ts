/**
 * Pairing (plan 3.5): a one-time link `/pair/<token>` is exchanged for an HttpOnly cookie, and from then on the host
 * answers `/world-api/*` (health excepted) only to requests that carry it. Pure state here, no HTTP: `host.ts` wires it.
 *
 * - A token is 32 random bytes, base64url. Only its SHA-256 is kept, with its expiry (10 minutes); redeeming deletes it.
 * - The cookie is `<id>.<stamp>.<mac>`: 16 random bytes, the time of its last use (seconds since the epoch) and their
 *   HMAC-SHA256 under the pairing secret, checked with a constant-time compare. Nothing about a cookie is stored, so
 *   the secret alone decides: a per-run secret makes a restart invalidate every pairing; a secret kept in
 *   `CREWHUB_WORLD_PAIRING_FILE` (mode 0600) keeps them.
 * - The idle expiry (round 31, question 2): a cookie whose stamp is older than `idleMs` (default 30 days; 0 never) is
 *   refused, and the window slides with every use: a cookie in use whose stamp is older than an hour is issued again
 *   with a fresh stamp (`check` hands the value back, `host.ts` sets it). The stamp sits inside the signed value, so
 *   the host keeps no last-use map and a restart with the kept secret keeps the window exactly; a stamp edited by the
 *   cookie's holder breaks the signature. The cookie stays a session cookie (no `Max-Age`): the host decides, as a
 *   browser's own expiry would not end a copied cookie.
 * - Neither the token, nor the cookie value, nor the secret is ever logged or put in a response body.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PAIR_COOKIE = "crewhub_world_pair";
export const PAIR_TTL_MS = 10 * 60_000;
export const PAIR_PATH_PREFIX = "/pair/";
/** How long a pairing may go unused before it is refused, by default: 30 days (question 2's default). `0` is never. */
export const DEFAULT_PAIRING_IDLE_MS = 30 * 24 * 60 * 60_000;
/** A cookie in use whose stamp is older than this is issued again with a fresh stamp: the window slides, to the hour. */
export const PAIR_RENEW_MS = 60 * 60_000;
const SECRET_BYTES = 32;
const TOKEN_BYTES = 32;
const COOKIE_ID_BYTES = 16;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** The cookie's stamp: seconds since the epoch, decimal. */
const STAMP = /^\d{1,12}$/;

export interface PairingOptions {
  /** The secret the cookies are signed with; a fresh random one when absent (per run). */
  secret?: Buffer;
  /** The clock, for tests. */
  now?: () => number;
  ttlMs?: number;
  /** A cookie unused this long is refused; 0 never. Default DEFAULT_PAIRING_IDLE_MS. */
  idleMs?: number;
}

/** What a Cookie header says: paired (with a fresh value to set when the stamp is older than PAIR_RENEW_MS), expired, or none. */
export type PairVerdict = { state: "paired"; renew: string | null } | { state: "expired" } | { state: "none" };

export interface Pairing {
  /** A fresh single-use token, valid `ttlMs`. The caller turns it into a link; it is never logged here. */
  mintToken(): string;
  /** Exchanges a token once: the cookie value to set, or null for an unknown, used or expired token. */
  redeem(token: string): string | null;
  /**
   * The Cookie header's verdict: `paired` when a cookie verifies and its stamp is within the idle window (with `renew`,
   * a re-stamped value to set, when the stamp is older than PAIR_RENEW_MS); `expired` when every cookie that verifies
   * is past the window; `none` otherwise.
   */
  check(cookieHeader: string | undefined): PairVerdict;
  /** Whether a Cookie header carries a valid, unexpired pairing cookie (`check(...).state === "paired"`). */
  isPaired(cookieHeader: string | undefined): boolean;
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

  const mac = (id: string, stamp: string) => createHmac("sha256", secret).update(`cookie:${id}:${stamp}`).digest("base64url");
  /** The cookie value for `id`, stamped now. */
  const issue = (id: string) => {
    const stamp = String(Math.floor(now() / 1000));
    return `${id}.${stamp}.${mac(id, stamp)}`;
  };

  function prune(): void {
    const t = now();
    for (const [hash, expiry] of tokens) if (expiry <= t) tokens.delete(hash);
  }

  const check = (cookieHeader: string | undefined): PairVerdict => {
    // Every cookie of that name is tried (review F2): a loopback server the browser visits can set a second
    // `crewhub_world_pair` on another path, and browsers send the longer path first; any one that verifies pairs.
    let expired = false;
    for (const value of readCookies(cookieHeader, PAIR_COOKIE)) {
      const parts = value.split(".");
      if (parts.length !== 3) continue;
      const [id, stamp, given] = parts as [string, string, string];
      if (!BASE64URL.test(id) || !STAMP.test(stamp) || !BASE64URL.test(given)) continue;
      const expected = mac(id, stamp);
      if (Buffer.byteLength(given) !== Buffer.byteLength(expected)) continue;
      if (!timingSafeEqual(Buffer.from(given), Buffer.from(expected))) continue;
      const age = now() - Number(stamp) * 1000;
      if (idleMs > 0 && age > idleMs) {
        expired = true;
        continue;
      }
      return { state: "paired", renew: idleMs > 0 && age > PAIR_RENEW_MS ? issue(id) : null };
    }
    return expired ? { state: "expired" } : { state: "none" };
  };

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
      return issue(b64url(randomBytes(COOKIE_ID_BYTES)));
    },
    check,
    isPaired: (cookieHeader) => check(cookieHeader).state === "paired",
    pending() {
      prune();
      return tokens.size;
    },
    idleMs,
  };
}

/** Every value of the cookies named `name` in a Cookie header, in the header's order (a browser may send several). */
export function readCookies(header: string | undefined, name: string): string[] {
  if (header === undefined || header === "") return [];
  const out: string[] = [];
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    out.push(part.slice(eq + 1).trim());
  }
  return out;
}

/** The value of the first cookie named `name` in a Cookie header, or null. */
export function readCookie(header: string | undefined, name: string): string | null {
  return readCookies(header, name)[0] ?? null;
}

/** The Set-Cookie header for a cookie value. `secure` when the host is reached over https (CREWHUB_WORLD_PUBLIC_URL). */
export function pairCookieHeader(value: string, secure: boolean): string {
  return `${PAIR_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/${secure ? "; Secure" : ""}`;
}

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
