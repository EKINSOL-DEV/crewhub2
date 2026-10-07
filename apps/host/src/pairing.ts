/**
 * Pairing (plan 3.5): a one-time link `/pair/<token>` is exchanged for an HttpOnly cookie, and from then on the host
 * answers `/world-api/*` (health excepted) only to requests that carry it. Pure state here, no HTTP: `host.ts` wires it.
 *
 * - A token is 32 random bytes, base64url. Only its SHA-256 is kept, with its expiry (10 minutes); redeeming deletes it.
 * - The cookie is `<id>.<mac>`: 16 random bytes and their HMAC-SHA256 under the pairing secret, checked with a
 *   constant-time compare. Nothing about a cookie is stored, so the secret alone decides: a per-run secret makes a
 *   restart invalidate every pairing; a secret kept in `CREWHUB_WORLD_PAIRING_FILE` (mode 0600) keeps them.
 * - Neither the token, nor the cookie value, nor the secret is ever logged or put in a response body.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PAIR_COOKIE = "crewhub_world_pair";
export const PAIR_TTL_MS = 10 * 60_000;
export const PAIR_PATH_PREFIX = "/pair/";
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
}

export interface Pairing {
  /** A fresh single-use token, valid `ttlMs`. The caller turns it into a link; it is never logged here. */
  mintToken(): string;
  /** Exchanges a token once: the cookie value to set, or null for an unknown, used or expired token. */
  redeem(token: string): string | null;
  /** Whether a Cookie header carries a valid pairing cookie. */
  isPaired(cookieHeader: string | undefined): boolean;
  /** How many unredeemed, unexpired tokens are out (tests). */
  pending(): number;
}

const b64url = (bytes: Buffer) => bytes.toString("base64url");
const hashToken = (token: string) => createHmac("sha256", "crewhub-world-pair-token").update(token).digest("base64url");

export function createPairing(options: PairingOptions = {}): Pairing {
  const secret = options.secret ?? randomBytes(SECRET_BYTES);
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? PAIR_TTL_MS;
  /** token hash → expiry (ms). */
  const tokens = new Map<string, number>();

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
    isPaired(cookieHeader) {
      const value = readCookie(cookieHeader, PAIR_COOKIE);
      if (value === null) return false;
      const dot = value.indexOf(".");
      if (dot <= 0) return false;
      const id = value.slice(0, dot);
      const given = value.slice(dot + 1);
      if (!BASE64URL.test(id) || !BASE64URL.test(given)) return false;
      const expected = mac(id);
      if (given.length !== expected.length) return false;
      return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    },
    pending() {
      prune();
      return tokens.size;
    },
  };
}

/** The value of one cookie in a Cookie header, or null. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (header === undefined || header === "") return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return part.slice(eq + 1).trim();
  }
  return null;
}

/** The Set-Cookie header for a cookie value. `secure` when the host is reached over https (CREWHUB_WORLD_PUBLIC_URL). */
export function pairCookieHeader(value: string, secure: boolean): string {
  return `${PAIR_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/${secure ? "; Secure" : ""}`;
}

/** A plain HTML page: the link is used up, expired or unknown. */
export const PAIR_REFUSED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CrewHub World: link expired</title>
<style>body{font-family:system-ui,sans-serif;margin:3rem auto;max-width:36rem;padding:0 1rem;line-height:1.5}code{padding:.1em .3em;border-radius:.3em;background:rgba(127,127,127,.18)}</style></head>
<body><h1>This link has expired or was already used.</h1><p>Run <code>npm run host -- open</code> for a new one.</p></body></html>
`;

/**
 * The pairing secret from a file, created when missing: 32 random bytes, base64url, mode 0600. A readable file with
 * loose permissions is tightened. The caller keeps the Buffer in memory and nowhere else.
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
    return Buffer.from(text, "base64url");
  }
  const secret = randomBytes(SECRET_BYTES);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, b64url(secret) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return secret;
}
