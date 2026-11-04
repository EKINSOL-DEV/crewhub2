/*
 * The tab's pairing (round 27, per-tab bearer): the one-time link `/#pair=<token>` lands with the token in the URL
 * fragment, which a browser never sends to a server; the page takes it out of the URL at once, exchanges it for a bearer
 * (`POST /world-api/pair`) and keeps the bearer in this tab's sessionStorage, from where every host request sends it
 * in the `x-world-pair` header (`bearerHeaders()`): the reads, the writes and the stream (the source streams with
 * fetch, so a header is possible). Its own header, not the HTTP authorization one: the bundle guard proves by that
 * word that the loops key never reaches the browser. No cookie, so another loopback port never receives the pairing and a cross-site
 * request can never carry it. A new tab of the same origin asks the open tabs over a BroadcastChannel and gets the
 * bearer handed over without a new link (`askTabsForPairing`, `answerTabs`); with no other tab open it meets the Pair
 * screen. The bearer dies with the tab (sessionStorage): a browser restart needs a new link, unless the browser
 * restores its tabs. Pure of React; the DOM reads are guarded for tests.
 */

export const PAIR_FRAGMENT = "pair";
export const PAIR_HEADER = "x-world-pair";
export const PAIRING_KEY = "crewhub-world.pair";
const CHANNEL = "crewhub-world.pair";

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
const storage = (): Storage | null => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

/** The token in `#pair=<token>` of a location's hash, or null; the fragment's other parts are ignored. */
export function tokenFromHash(hash: string): string | null {
  const text = hash.startsWith("#") ? hash.slice(1) : hash;
  const m = new RegExp(`(?:^|&)${PAIR_FRAGMENT}=([A-Za-z0-9_-]{43})(?:&|$)`).exec(text);
  return m === null ? null : (m[1] as string);
}

/** Takes the token out of the page's URL (history.replaceState, no reload) and returns it; null when there is none. */
export function takeFragmentToken(location: { hash: string; pathname: string; search: string } = globalThis.location, history: { replaceState(data: unknown, unused: string, url: string): void } | null = globalThis.history ?? null): string | null {
  const token = tokenFromHash(location.hash);
  if (token === null) return null;
  try {
    history?.replaceState(null, "", `${location.pathname}${location.search}`);
  } catch {
    // The URL keeps the fragment; the token is spent at the host anyway.
  }
  return token;
}

export const readPairing = (): string | null => storage()?.getItem(PAIRING_KEY) ?? null;
export const storePairing = (value: string): void => storage()?.setItem(PAIRING_KEY, value);
export const clearPairing = (): void => storage()?.removeItem(PAIRING_KEY);

/** The header every host request carries when this tab is paired; nothing otherwise. */
export function bearerHeaders(): Record<string, string> {
  const value = readPairing();
  return value === null ? {} : { [PAIR_HEADER]: value };
}

export type PairOutcome = { kind: "paired"; idleDays: number } | { kind: "off" } | { kind: "refused"; reason: string } | { kind: "failed" };

/** Exchanges a one-time token for the bearer at the host and keeps it; never throws. */
export async function redeemPairToken(token: string, baseUrl = "", timeoutMs = 5000): Promise<PairOutcome> {
  try {
    const response = await fetch(`${baseUrl}/world-api/pair`, { method: "POST", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json", [PAIR_HEADER]: token } });
    const body = (await response.json().catch(() => null)) as { bearer?: string | null; idleDays?: number; message?: string } | null;
    if (response.ok && body?.bearer === null) return { kind: "off" };
    if (response.ok && typeof body?.bearer === "string") {
      storePairing(body.bearer);
      return { kind: "paired", idleDays: typeof body.idleDays === "number" ? body.idleDays : 0 };
    }
    return { kind: "refused", reason: body?.message ?? `status ${response.status}` };
  } catch {
    return { kind: "failed" };
  }
}

type Channel = { postMessage(message: unknown): void; close(): void; onmessage: ((event: { data: unknown }) => void) | null };
const channel = (): Channel | null => {
  try {
    const Ctor = (globalThis as { BroadcastChannel?: new (name: string) => Channel }).BroadcastChannel;
    return Ctor === undefined ? null : new Ctor(CHANNEL);
  } catch {
    return null;
  }
};

/** Asks the other tabs of this origin for their bearer; the first answer within `timeoutMs` is kept. */
export function askTabsForPairing(timeoutMs = 300): Promise<string | null> {
  const ch = channel();
  if (ch === null) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (value: string | null) => {
      clearTimeout(timer);
      ch.close();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    ch.onmessage = (event) => {
      const data = event.data as { type?: string; bearer?: string } | null;
      if (data?.type === "bearer" && typeof data.bearer === "string" && data.bearer !== "") {
        storePairing(data.bearer);
        done(data.bearer);
      }
    };
    ch.postMessage({ type: "ask" });
  });
}

/** Answers other tabs' asks with this tab's bearer while this tab is open; returns a stop function. */
export function answerTabs(): () => void {
  const ch = channel();
  if (ch === null) return () => undefined;
  ch.onmessage = (event) => {
    const data = event.data as { type?: string } | null;
    const value = readPairing();
    if (data?.type === "ask" && value !== null) ch.postMessage({ type: "bearer", bearer: value });
  };
  return () => ch.close();
}
